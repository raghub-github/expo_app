export type AutomationTriggerEvent =
  | "ticket_created"
  | "ticket_updated"
  | "ticket_reopened"
  | "agent_went_online"
  | "agent_went_offline";

export type TicketSnapshot = {
  id: number;
  status: string | null;
  priority: string | null;
  group_id: number | null;
  ticket_type: string | null;
  ticket_category: string | null;
  service_type: string | null;
  raised_by_type: string | null;
  ticket_source: string | null;
  assigned_to_agent_id: number | null;
  tags: string[] | null;
  subject: string | null;
  /** First message / body text on the ticket (for keyword routing). */
  description: string | null;
  ticket_title: string | null;
};

export type AgentSnapshot = {
  user_id: number;
  current_status: string | null;
  is_online: boolean | null;
};

export type AutomationRuleRow = {
  id: number;
  rule_code: string;
  rule_name: string;
  rule_description: string | null;
  rule_priority: number;
  trigger_event: AutomationTriggerEvent;
  is_enabled: boolean;
  is_active: boolean;
  once_per_ticket: boolean;
  stop_after_match: boolean;
  execution_mode: string;
  execution_delay_seconds: number;
  max_action_retries: number;
  version: number;
};

export type ConditionRow = {
  id: number;
  rule_id: number;
  sort_order: number;
  field: string;
  operator: string;
  value: unknown;
  /** With prior rows: 'and' | 'or'. First condition ignores this. */
  combine_with_previous?: string | null;
};

export type ActionRow = {
  id: number;
  rule_id: number;
  sort_order: number;
  action_type: string;
  payload: Record<string, unknown>;
  /** With prior executed actions: 'and' | 'or' | 'if'. First action ignores this. */
  combine_with_previous?: string | null;
};

export type AutomationContext =
  | { kind: "ticket"; ticket: TicketSnapshot }
  | { kind: "agent"; agent: AgentSnapshot };
