import type { ResponseWorkflow } from '@mockingbird/shared-types';

/**
 * System-provided, parameterized CRUD templates for Data Stores. Seeded
 * idempotently by fixed id in ConfigService.load() (not gated on the
 * responseWorkflows array being empty, unlike the legacy "Default" workflow
 * seed) — so they're always present regardless of what else the user has
 * configured. Attach one to an endpoint, bind its parameters (which Data
 * Store, which path param is the record key), done.
 *
 * Deliberate tradeoff: seeding is per-id, so a deleted built-in reappears on
 * the next config load. There's no dismiss/hide mechanism in this pass.
 */
export const BUILTIN_WORKFLOWS: ResponseWorkflow[] = [
  {
    id: 'builtin-list-entity',
    name: 'List <Entity>',
    builtIn: true,
    parameters: [
      { name: 'entity', label: 'Data Store', type: 'dataStore', required: true },
    ],
    steps: [
      {
        id: 'step1', order: 1, type: 'use_data_store',
        store: '$param.entity', storeOperation: 'fetch', storeFetchMode: 'list',
      },
      {
        id: 'step2', order: 2, type: 'return_response',
        responseMode: 'template', responseStatusCode: 200,
        responseHeaders: { 'content-type': 'application/json' },
        responseBody: '{{store.$param.entity}}',
      },
    ],
  },
  {
    id: 'builtin-fetch-entity',
    name: 'Fetch <Entity>',
    builtIn: true,
    parameters: [
      { name: 'entity', label: 'Data Store', type: 'dataStore', required: true },
      { name: 'key', label: 'Record Key', type: 'pathParam', required: true },
    ],
    steps: [
      {
        id: 'step1', order: 1, type: 'use_data_store',
        store: '$param.entity', storeOperation: 'fetch', storeFetchMode: 'single',
        storeKey: '{{request.path_param.$param.key}}',
      },
      {
        id: 'step2', order: 2, type: 'return_response',
        condition: { type: 'store.exists', store: '$param.entity', param: '$param.key', op: 'exists' },
        responseMode: 'template', responseStatusCode: 200,
        responseHeaders: { 'content-type': 'application/json' },
        responseBody: '{{store.$param.entity}}',
      },
      {
        id: 'step3', order: 3, type: 'return_response',
        condition: { type: 'store.exists', store: '$param.entity', param: '$param.key', op: 'not_exists' },
        responseMode: 'template', responseStatusCode: 404,
        responseHeaders: { 'content-type': 'application/json' },
        responseBody: '{"error": "not found"}',
      },
    ],
  },
  {
    id: 'builtin-create-entity',
    name: 'Create <Entity>',
    builtIn: true,
    parameters: [
      { name: 'entity', label: 'Data Store', type: 'dataStore', required: true },
    ],
    steps: [
      {
        id: 'step1', order: 1, type: 'use_data_store',
        store: '$param.entity', storeOperation: 'save',
        storeKey: '{{request.body_json.$.id}}', storeKeyMode: 'uuid',
        storeValue: '{{request.body}}',
      },
      {
        id: 'step2', order: 2, type: 'return_response',
        responseMode: 'template', responseStatusCode: 201,
        responseHeaders: { 'content-type': 'application/json' },
        responseBody: '{{request.body}}',
      },
    ],
  },
  {
    id: 'builtin-edit-entity',
    name: 'Edit <Entity>',
    builtIn: true,
    parameters: [
      { name: 'entity', label: 'Data Store', type: 'dataStore', required: true },
      { name: 'key', label: 'Record Key', type: 'pathParam', required: true },
    ],
    steps: [
      {
        id: 'step1', order: 1, type: 'use_data_store',
        store: '$param.entity', storeOperation: 'save', storeMerge: true,
        storeKey: '{{request.path_param.$param.key}}', storeValue: '{{request.body}}',
      },
      {
        id: 'step2', order: 2, type: 'return_response',
        responseMode: 'template', responseStatusCode: 200,
        responseHeaders: { 'content-type': 'application/json' },
        responseBody: '{{request.body}}',
      },
    ],
  },
  {
    id: 'builtin-delete-entity',
    name: 'Delete <Entity>',
    builtIn: true,
    parameters: [
      { name: 'entity', label: 'Data Store', type: 'dataStore', required: true },
      { name: 'key', label: 'Record Key', type: 'pathParam', required: true },
    ],
    steps: [
      {
        id: 'step1', order: 1, type: 'use_data_store',
        store: '$param.entity', storeOperation: 'delete',
        storeKey: '{{request.path_param.$param.key}}',
      },
      {
        id: 'step2', order: 2, type: 'return_response',
        responseMode: 'template', responseStatusCode: 204, responseBody: '',
      },
    ],
  },
];
