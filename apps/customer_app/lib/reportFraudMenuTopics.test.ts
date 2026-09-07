import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pickReportFraudMenuTopics,
  REPORT_FRAUD_MENU_TOPIC_LABELS,
} from "./reportFraudMenuTopics";

describe("pickReportFraudMenuTopics", () => {
  it("pulls the three CUST_ORDERS titles in Help Topics order", () => {
    const picked = pickReportFraudMenuTopics([
      { ticket_title_id: 9, title_text: "Cancel my order" },
      {
        ticket_title_id: 3,
        title_code: "CUST_MENU_OTHER_ISSUE",
        title_text: "I have some other issue",
      },
      { ticket_title_id: 1, title_text: "Inaccurate photos or descriptions" },
      { ticket_title_id: 2, title_text: "Items are missing in the menu" },
    ]);
    assert.deepEqual(
      picked.map((row) => row.title_text),
      [...REPORT_FRAUD_MENU_TOPIC_LABELS]
    );
    assert.deepEqual(
      picked.map((row) => row.ticket_title_id),
      [1, 2, 3]
    );
  });
});
