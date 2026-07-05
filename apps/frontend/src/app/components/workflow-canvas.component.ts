import { Component, Input, Output, EventEmitter, TemplateRef, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';

export interface PaletteBlock {
  type: string;
  label: string;
  color: string;
}

export interface CanvasBranch {
  key: string;
  label: string;
  items: unknown[];
}

/** MIME type marking a drag as "a new palette block", carrying its `type` as the payload. */
const BLOCK_MIME = 'application/x-workflow-block';
/** MIME type marking a drag as "an existing, already-placed item" — see activeItemDrag below. */
const ITEM_MIME = 'application/x-workflow-item';

/**
 * Live reference to whatever existing item is currently being dragged, and which
 * canvas instance it came from. Module-level (not a class field) because the source
 * and the eventual drop target are two different WorkflowCanvasComponent instances,
 * possibly nested arbitrarily deep in each other — `dataTransfer` can only carry
 * strings, so this is how the actual item (and where to remove it from) survives the
 * trip from dragstart to drop.
 */
let activeItemDrag: { item: unknown; source: WorkflowCanvasComponent } | null = null;

/**
 * Generic drag-and-drop block canvas: a palette of block types on the right,
 * dropped/reordered into a list on the left. Items whose block type branches
 * (if_else/switch) get their own nested, recursively-rendered sub-canvases —
 * this component includes itself for that. It's deliberately shape-agnostic
 * (works for both WorkflowAction[] and ResponseWorkflowStep[]) via the
 * getBranches/setBranch/createItem callbacks the consumer provides; only the
 * leaf-level form fields are supplied by the consumer via `itemTemplate`.
 *
 * Everything here — new blocks from the palette, reordering, and moving an
 * existing block into/out of a nested branch — uses plain native HTML5
 * drag-and-drop (`draggable`, `dragover`, `drop`), not Angular CDK's
 * `cdkDrag`/`cdkDropList`. CDK was dropped entirely: a `cdkDropList` nested
 * inside another list's item is a known, only partially-fixed CDK limitation
 * (angular/components#16671) where a drop into the inner list resolves to
 * the outer one instead, and that held true even with the documented
 * workaround. Native drag-and-drop has well-defined nesting behavior instead
 * — `dragover`/`drop` bubble up the DOM, and the innermost listener that
 * calls `stopPropagation()` wins outright, with no ambiguity to resolve —
 * so every canvas list, top or nested at any depth, independently handles
 * its own `dragover`/`drop` and there's nothing to get confused between
 * levels. A "Move to…" menu on each block is kept as a click-based fallback
 * that doesn't depend on drag at all.
 */
@Component({
  standalone: true,
  selector: 'app-workflow-canvas',
  imports: [CommonModule, MatIconModule, MatTooltipModule, MatButtonModule, MatMenuModule, WorkflowCanvasComponent],
  template: `
    <div class="canvas-root" [class.nested]="!showPalette">
      <div class="canvas-shell">
        <div
          class="canvas-list"
          [class.drop-target-active]="isDropHighlighted"
          (dragover)="onDragOver($event)"
          (dragleave)="onDragLeave($event)"
          (drop)="onNativeDrop($event)">
          @if (items.length === 0) {
            <div class="empty-hint">Drag a block here, or use "Add block" below</div>
          }
          @for (item of items; track $index; let i = $index) {
            <div class="item-card">
              <div class="item-head">
                <div
                  class="drag-handle"
                  draggable="true"
                  matTooltip="Drag to move or reorder"
                  (dragstart)="onItemDragStart($event, item)"
                  (dragend)="onItemDragEnd($event)">
                  <mat-icon>drag_indicator</mat-icon>
                </div>
                <span class="type-badge" [style.background]="getTypeColor(item)">{{ getTypeLabel(item) }}</span>
                @if (moveTargets(item).length > 0 || (!showPalette && onMoveOut)) {
                  <button
                    class="move-btn"
                    type="button"
                    [matMenuTriggerFor]="moveMenu"
                    [matMenuTriggerData]="{ item: item, index: i }"
                    matTooltip="Move to a branch">
                    <mat-icon>drive_file_move</mat-icon>
                  </button>
                }
                <button class="remove-btn" type="button" (click)="removeItem(i)" matTooltip="Remove">
                  <mat-icon>close</mat-icon>
                </button>
              </div>
              <div class="item-body">
                <ng-container
                  *ngTemplateOutlet="itemTemplate; context: { $implicit: item, index: i, onChange: makeOnChange(i) }">
                </ng-container>
              </div>

              @if (getBranches(item); as branches) {
                <div class="branches">
                  @for (branch of branches; track branch.key) {
                    <div class="branch">
                      <div class="branch-label">{{ branch.label }}</div>
                      <app-workflow-canvas
                        [items]="branch.items"
                        [palette]="palette"
                        [createItem]="createItem"
                        [getBranches]="getBranches"
                        [setBranch]="setBranch"
                        [getTypeLabel]="getTypeLabel"
                        [getTypeColor]="getTypeColor"
                        [itemTemplate]="itemTemplate"
                        [showPalette]="false"
                        [onMoveOut]="makeMoveOutHandler()"
                        (itemsChange)="onBranchChange(i, branch.key, $event)">
                      </app-workflow-canvas>
                    </div>
                  }
                </div>
              }
            </div>
          }

          <button mat-stroked-button type="button" class="add-inline-btn" [matMenuTriggerFor]="addMenu">
            <mat-icon>add</mat-icon> Add block
          </button>
          <mat-menu #addMenu="matMenu">
            @for (block of palette; track block.type) {
              <button mat-menu-item type="button" (click)="addFromPalette(block.type)">
                <span class="chip-dot" [style.background]="block.color"></span> {{ block.label }}
              </button>
            }
          </mat-menu>

          <mat-menu #moveMenu="matMenu">
            <ng-template matMenuContent let-item="item" let-index="index">
              @for (target of moveTargets(item); track target.siblingIndex + ':' + target.branchKey) {
                <button mat-menu-item type="button" (click)="moveInto(index, target.siblingIndex, target.branchKey)">
                  <mat-icon>subdirectory_arrow_right</mat-icon> {{ target.label }}
                </button>
              }
              @if (!showPalette && onMoveOut) {
                <button mat-menu-item type="button" (click)="moveOut(index)">
                  <mat-icon>arrow_upward</mat-icon> Move out to parent list
                </button>
              }
            </ng-template>
          </mat-menu>
        </div>

        @if (showPalette) {
          <div class="palette">
            <div class="palette-title">Blocks</div>
            @for (block of palette; track block.type) {
              <div
                class="palette-chip"
                draggable="true"
                [style.borderColor]="block.color"
                (dragstart)="onChipDragStart($event, block)">
                <span class="chip-dot" [style.background]="block.color"></span>
                {{ block.label }}
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .canvas-shell { display: flex; gap: 16px; align-items: flex-start; }
    .canvas-list { flex: 1; display: flex; flex-direction: column; gap: 10px; min-height: 56px; border-radius: 10px; transition: transform 120ms ease, box-shadow 120ms ease; }
    .canvas-list.drop-target-active { transform: scale(1.015); box-shadow: 0 0 0 2px #6366f1, 0 6px 16px rgba(99,102,241,0.25); background: #eef2ff; z-index: 1; position: relative; }
    .nested .canvas-list { min-height: 40px; }
    .empty-hint { border: 1px dashed #cbd5e1; border-radius: 8px; padding: 14px; text-align: center; color: #94a3b8; font-size: 12px; }
    .add-inline-btn { align-self: flex-start; font-size: 12px; }
    .add-inline-btn mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .item-card { border: 1px solid #e2e8f0; border-left: 4px solid #6366f1; border-radius: 8px; background: white; transition: opacity 120ms ease; }
    .item-card.dragging-source { opacity: 0.4; }
    .item-head { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid #f1f5f9; }
    .drag-handle { cursor: grab; color: #94a3b8; display: flex; align-items: center; }
    .type-badge { padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; color: white; }
    .move-btn { margin-left: auto; background: none; border: none; color: #94a3b8; cursor: pointer; display: flex; align-items: center; padding: 2px; border-radius: 4px; }
    .move-btn:hover { background: #eef2ff; color: #6366f1; }
    .remove-btn { background: none; border: none; color: #94a3b8; cursor: pointer; display: flex; align-items: center; padding: 2px; border-radius: 4px; }
    .remove-btn:hover { background: #fee2e2; color: #ef4444; }
    .item-body { padding: 10px; }
    .branches { display: flex; flex-direction: column; gap: 8px; padding: 0 10px 10px; }
    .branch { border: 1px dashed #cbd5e1; border-radius: 8px; padding: 8px; background: #f8fafc; }
    .branch-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 6px; }
    .palette { width: 180px; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; position: sticky; top: 0; }
    .palette-title { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px; }
    .palette-chip { display: flex; align-items: center; gap: 8px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; font-size: 12px; font-weight: 600; color: #334155; cursor: grab; background: white; }
    .palette-chip:hover { box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
    .chip-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  `],
})
export class WorkflowCanvasComponent implements OnChanges {
  @Input() items: unknown[] = [];
  @Input() palette: PaletteBlock[] = [];
  @Input() createItem: (type: string) => unknown = () => ({});
  @Input() getBranches: (item: unknown) => CanvasBranch[] | null = () => null;
  @Input() setBranch: (item: unknown, key: string, items: unknown[]) => unknown = item => item;
  @Input() getTypeLabel: (item: unknown) => string = () => '';
  @Input() getTypeColor: (item: unknown) => string = () => '#64748b';
  @Input() itemTemplate!: TemplateRef<any>;
  @Input() showPalette = true;
  /** Provided by the parent only on nested (branch) instances — lets an item be moved
   *  back out to the parent's own list via the "Move to…" menu, since that's a cross-
   *  instance operation this component can't do on its own. */
  @Input() onMoveOut: ((item: unknown) => void) | undefined;
  @Output() itemsChange = new EventEmitter<unknown[]>();

  isDropHighlighted = false;
  private dropIndex: number | null = null;

  /**
   * A cross-branch move (e.g. Then → Else of the same if_else) fires two
   * itemsChange emits back-to-back that both bubble up through the SAME
   * parent's onBranchChange — Angular doesn't update `@Input() items`
   * synchronously between them, so the second call would otherwise read the
   * pre-removal array and duplicate the item instead of moving it. This
   * shadow value tracks "what my items actually are right now" across a
   * synchronous burst of mutations, and gets cleared once a real update
   * flows back down through the normal @Input, so it never goes stale.
   */
  private pendingItems: unknown[] | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['items']) this.pendingItems = null;
  }

  private currentItems(): unknown[] {
    return this.pendingItems ?? this.items;
  }

  private commit(items: unknown[]): void {
    this.pendingItems = items;
    this.itemsChange.emit(items);
  }

  onChipDragStart(event: DragEvent, block: PaletteBlock): void {
    event.dataTransfer?.setData(BLOCK_MIME, block.type);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }

  onItemDragStart(event: DragEvent, item: unknown): void {
    event.dataTransfer?.setData(ITEM_MIME, '1');
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    activeItemDrag = { item, source: this };
    (event.currentTarget as HTMLElement).closest('.item-card')?.classList.add('dragging-source');
  }

  onItemDragEnd(event: DragEvent): void {
    activeItemDrag = null;
    (event.currentTarget as HTMLElement).closest('.item-card')?.classList.remove('dragging-source');
  }

  onDragOver(event: DragEvent): void {
    const types = event.dataTransfer?.types;
    if (!types?.includes(BLOCK_MIME) && !types?.includes(ITEM_MIME)) return;
    event.preventDefault();
    event.stopPropagation();
    this.isDropHighlighted = true;
    this.dropIndex = this.computeDropIndex(event);
  }

  onDragLeave(event: DragEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && (event.currentTarget as HTMLElement).contains(next)) return;
    this.isDropHighlighted = false;
    this.dropIndex = null;
  }

  /** Which index a drop should insert at, based on whether the pointer is above or
   *  below the vertical midpoint of each of THIS list's own direct item-cards
   *  (nested branches' cards are deeper descendants, never counted here). */
  private computeDropIndex(event: DragEvent): number {
    const listEl = event.currentTarget as HTMLElement;
    const cards = Array.from(listEl.children).filter(el => el.classList.contains('item-card')) as HTMLElement[];
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) return i;
    }
    return cards.length;
  }

  onNativeDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDropHighlighted = false;
    const dropIndex = this.dropIndex ?? this.currentItems().length;
    this.dropIndex = null;

    const blockType = event.dataTransfer?.getData(BLOCK_MIME);
    if (blockType) {
      const items = [...this.currentItems()];
      items.splice(dropIndex, 0, this.createItem(blockType));
      this.commit(items);
      return;
    }

    if (!event.dataTransfer?.types.includes(ITEM_MIME) || !activeItemDrag) return;
    const { item, source } = activeItemDrag;
    activeItemDrag = null;

    if (source === this) {
      const items = [...this.currentItems()];
      const fromIndex = items.indexOf(item);
      if (fromIndex === -1) return;
      items.splice(fromIndex, 1);
      const adjustedDropIndex = dropIndex > fromIndex ? dropIndex - 1 : dropIndex;
      items.splice(adjustedDropIndex, 0, item);
      this.commit(items);
    } else {
      const sourceItems = [...source.currentItems()];
      const fromIndex = sourceItems.indexOf(item);
      if (fromIndex !== -1) sourceItems.splice(fromIndex, 1);
      source.commit(sourceItems);

      const items = [...this.currentItems()];
      items.splice(dropIndex, 0, item);
      this.commit(items);
    }
  }

  /** Appends a block — used by the "Add block" button. */
  addFromPalette(type: string): void {
    this.commit([...this.currentItems(), this.createItem(type)]);
  }

  removeItem(index: number): void {
    const items = [...this.currentItems()];
    items.splice(index, 1);
    this.commit(items);
  }

  makeOnChange(index: number): (updated: unknown) => void {
    return (updated: unknown) => {
      const items = [...this.currentItems()];
      items[index] = updated;
      this.commit(items);
    };
  }

  onBranchChange(index: number, key: string, branchItems: unknown[]): void {
    const items = [...this.currentItems()];
    items[index] = this.setBranch(items[index], key, branchItems);
    this.commit(items);
  }

  /** Click-based fallback for relocating an existing item that doesn't depend on drag
   *  at all — handy for precise moves or if a browser/environment makes native drag
   *  awkward. */
  moveTargets(item: unknown): { label: string; siblingIndex: number; branchKey: string }[] {
    const targets: { label: string; siblingIndex: number; branchKey: string }[] = [];
    this.items.forEach((sibling, idx) => {
      if (sibling === item) return;
      for (const branch of this.getBranches(sibling) ?? []) {
        targets.push({ label: `${this.getTypeLabel(sibling)} → ${branch.label}`, siblingIndex: idx, branchKey: branch.key });
      }
    });
    return targets;
  }

  moveInto(itemIndex: number, siblingIndex: number, branchKey: string): void {
    const items = [...this.currentItems()];
    const [moved] = items.splice(itemIndex, 1);
    const adjustedSiblingIndex = siblingIndex > itemIndex ? siblingIndex - 1 : siblingIndex;
    const sibling = items[adjustedSiblingIndex];
    const branch = (this.getBranches(sibling) ?? []).find(b => b.key === branchKey);
    items[adjustedSiblingIndex] = this.setBranch(sibling, branchKey, [...(branch?.items ?? []), moved]);
    this.commit(items);
  }

  /** Only relevant on a nested instance with onMoveOut set — removes the item from this
   *  branch's own list and hands it to the parent, which appends it to its own list. */
  moveOut(index: number): void {
    if (!this.onMoveOut) return;
    const items = [...this.currentItems()];
    const [moved] = items.splice(index, 1);
    this.commit(items);
    this.onMoveOut(moved);
  }

  makeMoveOutHandler(): (item: unknown) => void {
    return (item: unknown) => {
      this.commit([...this.currentItems(), item]);
    };
  }
}
