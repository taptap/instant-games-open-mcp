export interface MakerClientModel {
  client_model_id?: string;
  client_model_name?: string;
  resolved_model?: string;
  model_provider?: string;
  model_lookup_scope?: 'current_call' | 'current_session' | 'latest_session';
  model_lookup_source?: 'request_metadata' | 'tool_argument' | 'local_session';
}

export interface MakerClientModelContext {
  clientName?: string;
  /** Validated project directory, used only for local lookup. */
  projectDir?: string;
  /** Validated snapshot extracted from this request, never shared between calls. */
  requestModel?: MakerClientModel;
}
