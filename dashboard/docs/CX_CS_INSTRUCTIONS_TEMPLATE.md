## CX / CS handling instructions

This template is used on:

- The **Food orders search dashboard**
- The **individual order detail page**

Update this file whenever CX / CS flows change so both views stay in sync.

---

## 1. Food orders search dashboard – before opening order

- **Check filters**
  - Confirm you are on the correct tab (Payment Done / Accepted / Despatch Ready / Despatched / Bulk).
  - Apply any required delivery / user-type filters before starting work.
- **Scan key columns**
  - Verify **Order ID**, **Routed to**, **User name / mobile**, **Merchant id**, **DE provider**, and **last updated time**.
  - Prioritise tickets where updated time is old but status has not progressed.
- **Open the correct order**
  - Always open the order using the **Order ID chip** (opens in new tab).
  - Avoid working only from dashboard row; detailed actions must be taken from the order page.

---

## 2. Individual order page – before speaking to customer

- **Verify basic details**
  - Confirm order ID, order type (Food / Parcel / Person ride), and current status from the header.
  - Check created time vs latest status to understand delay.
- **Check routing and history**
  - Look at **Routed To** email and latest **remarks** to see previous agent actions.
  - Review **Rider recon** and **Rejection info / refunds** (if available).
- **Confirm logistics**
  - Validate merchant details, rider assignment, and any location / distance mismatch flags.
  - Check payment status and refund tags before promising anything related to money.

---

## 3. While on call / chat with customer

- **Authenticate**
  - Verify customer name and registered mobile number.
  - If details don’t match, do not share order specifics; follow escalation process.
- **Communicate status clearly**
  - Use only the status and timestamps visible on the screen (merchant / rider events, recon entries).
  - Avoid custom promises or ETAs that are not supported by current data.
- **Set expectations**
  - Where delay is visible, acknowledge it and explain the latest internal step (e.g. “with rider”, “waiting at merchant”, “refund under process”).
  - For merchant / rider issues, avoid blaming language; focus on resolution steps.

---

## 4. After the interaction

- **Log remarks properly**
  - Add a remark with correct category **(Customer / Merchant / Rider / Other)**.
  - Use preset + free text to capture both the reason and key conversation points.
- **Take required actions**
  - Raise / update **Rider recon**, **refund**, or **ticket** only as per policy.
  - If ownership is shifting, ensure **Routed To** reflects the correct queue / agent.
- **Verify state**
  - Refresh data and confirm that status / remarks / recon entries are saved.
  - If anything critical fails to save, escalate to tech / lead immediately.

