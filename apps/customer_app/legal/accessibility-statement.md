# Accessibility Statement

**Effective Date:** 21 June 2026
**Last Updated:** 21 June 2026
**Version:** 1.0

> GatiMitra's commitment to being usable by everyone, in compliance with the Rights of Persons with Disabilities Act, 2016 and WCAG 2.2 AA targets.

## 1. Our commitment

We believe transportation, food, and delivery services must be accessible to everyone — including users with visual, hearing, motor, cognitive, or other disabilities. We design, develop, and test the GatiMitra app with accessibility as a first-class requirement.

## 2. Standards we target

| Area | Standard |
|---|---|
| Mobile UI | WCAG 2.2 Level AA |
| Indian law | Rights of Persons with Disabilities Act, 2016 §40 (Accessible Information) |
| iOS | Apple Accessibility (VoiceOver, Dynamic Type, Reduce Motion, Voice Control) |
| Android | Google Accessibility (TalkBack, Switch Access, Live Captions, Font scaling) |

## 3. Built-in support

### 3.1 Screen reader

- All interactive elements have accessible labels.
- Order / ride flows are voiceable end-to-end.
- Live tracking announces driver name, vehicle, plate, and ETA.
- Receipts read out line by line.

### 3.2 Font scaling

- The entire app respects your OS font size up to 200%.
- No clipped buttons, no overlapping text.

### 3.3 Colour contrast

- Body text ≥ 4.5:1 contrast ratio.
- UI components ≥ 3:1 contrast ratio.
- Two themes (light, dark) plus a high-contrast option in `Settings → Accessibility`.

### 3.4 Motor / touch

- Touch targets ≥ 44 pt (iOS) / 48 dp (Android).
- Drag-only actions have an equivalent button-press path.
- Long-press alternatives for users who can't perform them.

### 3.5 Reduced motion

- Animations dim or skip when "Reduce Motion" is enabled in your OS.

### 3.6 Cognitive

- Single-action default flows (e.g., one-tap reorder).
- Plain-language error messages.
- Confirmation before destructive actions.

### 3.7 Hearing

- All audio prompts have text alternatives.
- Live ride status visible in-app without sound.
- In-app chat available alongside calls.

### 3.8 Speech

- Type-to-text in-app chat fully supported.
- No voice-only flow blocks any feature.

## 4. Service accessibility

Per Rights of Persons with Disabilities Act, 2016 §40 and §41:

- **Service animals** (guide dog for visually impaired, assistance animals) allowed in every ride at no extra charge.
- **Wheelchairs / mobility aids** accommodated; the partner assists with loading at no extra charge.
- **Wheelchair-accessible vehicles** filterable in select cities (`Filters → Accessibility → Wheelchair accessible`).
- **Sign language** support coming for customer-care calls (city pilot).
- **Cognitive support:** simplified UI mode (`Settings → Accessibility → Simplified mode`) reduces options to essentials.

## 5. Driver / delivery partner training

Every partner is trained on:

- Disability-respectful behaviour.
- Service-animal accommodation.
- Wheelchair handling.
- Assisting boarding / alighting.
- Communicating with deaf, mute, and blind passengers.

Failure to accommodate triggers immediate review per [Anti-Discrimination Policy](./anti-discrimination-policy.md).

## 6. Testing

| Layer | How |
|---|---|
| Automated checks | Lint rules for missing labels / contrast / target size on every PR. |
| Manual checks | Each release tested with VoiceOver, TalkBack, font-scale 200%, reduce-motion, high-contrast. |
| User testing | Quarterly sessions with users with disabilities — paid, on-record consent. |
| External audit | Annual third-party accessibility audit; report at https://gatimitra.com/accessibility-report. |

## 7. Known gaps (transparent)

We publish current gaps and ETAs to close them:

| Gap | ETA |
|---|---|
| Sign-language video relay for customer care | Q4 2026 |
| Hindi VoiceOver / TalkBack labels for all error messages | Q3 2026 |
| Wheelchair-accessible vehicle availability in tier-2 cities | Rolling |
| Audio descriptions for restaurant menus | Pilot Q1 2027 |

## 8. Report an accessibility barrier

Email **accessibility@gatimitra.com** with:
- What you tried to do.
- What you expected.
- What happened.
- Device + OS + app version.

We acknowledge within 24 hours and respond with a fix or workaround within 7 days. Critical accessibility blockers receive a hotfix release within 14 days.

## 9. Alternative ways to use GatiMitra

If the app isn't accessible to you in the moment, you can:

- Use the **website** at https://gatimitra.com (basic ordering + ride booking, mobile-web optimised).
- Call our **toll-free helpline 1800-XXX-XXXX** — a human will help.
- Have a guardian / family member book on your behalf.

## 10. Procurement of accessible tooling

Where we add a third-party SDK or vendor, we require an accessibility statement from them.

## 11. Statutory rights

This Statement is in addition to your rights under the Rights of Persons with Disabilities Act, 2016, the Consumer Protection Act 2019, and any other applicable Indian law.

## 12. Contact

| Concern | Channel |
|---|---|
| Report a barrier | accessibility@gatimitra.com |
| Wheelchair / service-animal accommodation | accessibility@gatimitra.com |
| Driver behaviour incident | discrimination@gatimitra.com / safety@gatimitra.com |
| Grievance escalation | grievance.officer@gatimitra.com |

---
**Owner:** Engineering + Trust & Safety
