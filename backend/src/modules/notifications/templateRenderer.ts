/**
 * Template rendering — safe {{variable}} substitution.
 *
 * Rules:
 *   • Variables use {{camelCase}} or {{snake_case}}. No expressions, no
 *     conditionals — keep the language safe-by-default. If you need logic,
 *     compute it in the caller and pass the result as a flat variable.
 *   • Unknown variables render as the empty string (silently). This avoids
 *     ugly "{{orderId}}" leaking into a user's notification when a caller
 *     forgets one.
 *   • All values are coerced to strings; numbers stay precise (no Intl
 *     formatting here — locale-aware formatting is the caller's job).
 *   • Deep-link templates are URL-safe-encoded for the segment values.
 *
 * Safety: no eval, no dynamic access into globals, no prototype walks.
 */
import type { NotificationTemplate, TemplateVariables } from "./types.js";

const VAR_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

function coerce(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  // Defensive — never let an object/array leak through stringified
  return "";
}

function substitute(template: string, vars: TemplateVariables): string {
  return template.replace(VAR_PATTERN, (_match, name: string) => coerce(vars[name]));
}

/**
 * Deep-link interpolation. Path segments get URI-encoded so an order_id
 * like "GM/10000042" doesn't break the route.
 */
function substituteDeepLink(template: string | null, vars: TemplateVariables): string | null {
  if (!template) return null;
  return template.replace(VAR_PATTERN, (_match, name: string) =>
    encodeURIComponent(coerce(vars[name])),
  );
}

export type RenderedNotification = {
  title: string;
  body: string;
  imageUrl: string | null;
  deepLink: string | null;
  clickAction: string | null;
  iconUrl: string | null;
  buttons: Array<{ label: string; action: string; deepLink?: string }> | null;
};

/**
 * Render a template with the given variables into a delivery-ready
 * notification payload.
 */
export function renderTemplate(
  template: NotificationTemplate,
  vars: TemplateVariables,
): RenderedNotification {
  return {
    title: substitute(template.title_template, vars),
    body: substitute(template.body_template, vars),
    imageUrl: template.image_url,
    deepLink: substituteDeepLink(template.deep_link, vars),
    clickAction: template.click_action,
    iconUrl: template.icon_url,
    buttons:
      template.buttons?.map((b) => ({
        label: substitute(b.label, vars),
        action: b.action,
        deepLink: b.deepLink ? substituteDeepLink(b.deepLink, vars) ?? undefined : undefined,
      })) ?? null,
  };
}

/**
 * Validate that a template's required variables are present in the given
 * vars object. Returns missing-variable names. Empty array = all present.
 */
export function findMissingVariables(
  template: NotificationTemplate,
  vars: TemplateVariables,
): string[] {
  const required = Object.keys(template.variables_schema ?? {});
  return required.filter((k) => vars[k] === undefined || vars[k] === null || vars[k] === "");
}
