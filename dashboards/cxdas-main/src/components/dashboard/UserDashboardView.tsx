"use client";

import { Header } from "../layout/Header";
import type { ReactNode } from "react";

export interface UserRecord {
  id?: string | number;
  [key: string]: unknown;
}

interface UserDashboardViewProps {
  user: UserRecord | null;
}

export function UserDashboardView({ user }: UserDashboardViewProps) {
  if (!user) {
    return (
      <>
        <Header />
        <div className="container">
          <div className="card">
            <div className="card-title">No User Found</div>
            <p style={{ color: "var(--text-muted)", marginTop: 12 }}>
              The user could not be found. Please try a different search.
            </p>
          </div>
        </div>
      </>
    );
  }

  const getStatusColor = (status: string) => {
    if (status && typeof status === "string") {
      if (status.toLowerCase() === "active") return "#00d084";
      if (status.toLowerCase() === "not active") return "#ff5252";
    }
    return "var(--text-muted)";
  };

  const formatDate = (dateString: any) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const InlineField = ({
    label,
    value,
    isStatus,
  }: {
    label: string;
    value: ReactNode;
    isStatus?: boolean;
  }) => (
    <span style={{ marginRight: 32, display: "inline-block", marginBottom: 8 }}>
      <span style={{ color: "#708090", fontSize: 12, fontWeight: 500 }}>
        {label}
      </span>{" "}
      <span
        style={{
          color: isStatus ? getStatusColor(value as string) : "#0f1419",
          fontWeight: isStatus ? 600 : 500,
          marginLeft: 4,
        }}
      >
        {value || "—"}
      </span>
    </span>
  );

  return (
    <>
      <Header />
      <div className="container" style={{ marginTop: 20, marginBottom: 40 }}>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 800,
            marginBottom: 28,
            color: "#0f1419",
          }}
        >
          Customer Details
        </h2>

        <div
          style={{
            background: "#f5f7fa",
            borderRadius: 16,
            padding: "32px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          {/* Row 1: Basic Info */}
          <div
            style={{
              marginBottom: 24,
              fontSize: 13,
              paddingBottom: 20,
              borderBottom: "1px solid #e1e8ed",
            }}
          >
            <InlineField label="User id" value={user.user_id as ReactNode} />
            <InlineField label="Name" value={user.name as ReactNode} />
            <InlineField label="User number" value={user.user_number as ReactNode} />
            <InlineField label="Email id" value={user.email as ReactNode} />
            <InlineField label="User Type" value={user.user_type as ReactNode} />
          </div>

          {/* Row 2: GatiMitra & Referral Info */}
          <div
            style={{
              marginBottom: 24,
              fontSize: 13,
              paddingBottom: 20,
              borderBottom: "1px solid #e1e8ed",
            }}
          >
            <InlineField
              label="GatiMitra Status"
              value={user.gatimitra_status as ReactNode}
              isStatus={true}
            />
            <InlineField label="Referral code" value={user.referral_code as ReactNode} />
            <InlineField
              label="App installed with referral"
              value={user.app_installed_with_referral as ReactNode}
            />
            <InlineField label="Referral code used" value="—" />
          </div>

          {/* Row 3: Account Info */}
          <div
            style={{
              marginBottom: 24,
              fontSize: 13,
              paddingBottom: 20,
              borderBottom: "1px solid #e1e8ed",
            }}
          >
            <InlineField
              label="Account Status"
              value={user.account_status as ReactNode}
              isStatus={true}
            />
            <InlineField
              label="Account Balance"
              value={`₹ ${user.account_balance || 0}` as ReactNode}
            />
            <InlineField
              label="Account Creation Date"
              value={formatDate(user.account_creation_date)}
            />
            <InlineField label="Account Remark" value={user.account_remark as ReactNode} />
          </div>

          {/* Row 4: Device Info */}
          <div
            style={{
              marginBottom: 24,
              fontSize: 13,
              paddingBottom: 20,
              borderBottom: "1px solid #e1e8ed",
            }}
          >
            <InlineField label="Current Device Id" value={user.device_id as ReactNode} />
            <InlineField label="Phone model" value={user.phone_model as ReactNode} />
            <InlineField label="Brand" value={user.brand as ReactNode} />
            <span style={{ marginRight: 32, display: "inline-block" }}>
              <span style={{ color: "#708090", fontSize: 12, fontWeight: 500 }}>
                Logged Device List:
              </span>{" "}
              <span
                style={{
                  color: "#2563eb",
                  fontWeight: 600,
                  cursor: "pointer",
                  textDecoration: "underline",
                  marginLeft: 4,
                }}
              >
                (View)
              </span>
            </span>
          </div>

          {/* Row 5: APP & SMS */}
          <div
            style={{
              marginBottom: 28,
              fontSize: 13,
              paddingBottom: 20,
              borderBottom: "1px solid #e1e8ed",
            }}
          >
            <InlineField
              label="APP Download Date"
              value={formatDate(user.app_download_date)}
            />
            <InlineField
              label="SMS Permission"
              value={user.sms_permission ? "TRUE" : "FALSE"}
            />
          </div>

          {/* Links Row */}
          <div
            style={{
              marginBottom: 28,
              paddingBottom: 20,
              borderBottom: "1px solid #e1e8ed",
              fontSize: 13,
            }}
          >
            <span style={{ marginRight: 40, display: "inline-block", marginBottom: 8 }}>
              <span style={{ color: "#708090", fontWeight: 500 }}>
                Customer Account:
              </span>{" "}
              <a
                href="#"
                style={{
                  color: "#2563eb",
                  textDecoration: "none",
                  fontWeight: 600,
                  marginLeft: 4,
                }}
              >
                link ↗
              </a>
            </span>
            <span style={{ marginRight: 40, display: "inline-block", marginBottom: 8 }}>
              <span style={{ color: "#708090", fontWeight: 500 }}>
                Customer Notification:
              </span>{" "}
              <a
                href="#"
                style={{
                  color: "#2563eb",
                  textDecoration: "none",
                  fontWeight: 600,
                  marginLeft: 4,
                }}
              >
                link ↗
              </a>
            </span>
            <span style={{ marginRight: 40, display: "inline-block", marginBottom: 8 }}>
              <span style={{ color: "#708090", fontWeight: 500 }}>
                Current Addresses:
              </span>{" "}
              <span
                style={{
                  color: "#2563eb",
                  fontWeight: 600,
                  cursor: "pointer",
                  textDecoration: "underline",
                  marginLeft: 4,
                }}
              >
                (View)
              </span>
            </span>
          </div>

          {/* Dashboard Links */}
          <div
            style={{
              marginBottom: 28,
              paddingBottom: 20,
              borderBottom: "1px solid #e1e8ed",
              fontSize: 13,
            }}
          >
            <span style={{ marginRight: 40, display: "inline-block", marginBottom: 8 }}>
              <a
                href="#"
                style={{
                  color: "#2563eb",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Orders Dashboard:
              </a>{" "}
              <a
                href="#"
                style={{
                  color: "#2563eb",
                  textDecoration: "none",
                  fontWeight: 600,
                  marginLeft: 4,
                }}
              >
                link ↗
              </a>
            </span>
            <span style={{ marginRight: 40, display: "inline-block", marginBottom: 8 }}>
              <a
                href="#"
                style={{
                  color: "#2563eb",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                User Search History:
              </a>{" "}
              <a
                href="#"
                style={{
                  color: "#2563eb",
                  textDecoration: "none",
                  fontWeight: 600,
                  marginLeft: 4,
                }}
              >
                link ↗
              </a>
            </span>
            <span style={{ marginRight: 40, display: "inline-block", marginBottom: 8 }}>
              <a
                href="#"
                style={{
                  color: "#2563eb",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Prediction History:
              </a>{" "}
              <a
                href="#"
                style={{
                  color: "#2563eb",
                  textDecoration: "none",
                  fontWeight: 600,
                  marginLeft: 4,
                }}
              >
                link ↗
              </a>
            </span>
            <span style={{ marginRight: 40, display: "inline-block", marginBottom: 8 }}>
              <a
                href="#"
                style={{
                  color: "#2563eb",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Landing History:
              </a>{" "}
              <a
                href="#"
                style={{
                  color: "#2563eb",
                  textDecoration: "none",
                  fontWeight: 600,
                  marginLeft: 4,
                }}
              >
                link ↗
              </a>
            </span>
          </div>

          {/* Stats Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "300px 1fr 300px",
              gap: 28,
              marginBottom: 32,
            }}
          >
            {/* Score Table */}
            <div
              style={{
                background: "#ffffff",
                padding: "20px",
                borderRadius: 12,
                border: "1px solid #e1e8ed",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                }}
              >
                <tbody>
                  <tr style={{ borderBottom: "1px solid #e1e8ed" }}>
                    <td style={{ padding: "10px 8px", color: "#708090", fontWeight: 600 }}>
                      Score
                    </td>
                    <td style={{ padding: "10px 8px", color: "#708090", textAlign: "center" }}>
                      Actual
                    </td>
                    <td style={{ padding: "10px 8px", color: "#708090", textAlign: "center" }}>
                      Predicted
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #e1e8ed" }}>
                    <td style={{ padding: "10px 8px", color: "#0f1419" }}>Score</td>
                    <td style={{ padding: "10px 8px", color: "#0f1419", textAlign: "center" }}>
                      {(user.score_actual as number | null | undefined) || "—"}
                    </td>
                    <td style={{ padding: "10px 8px", color: "#0f1419", textAlign: "center" }}>
                      {(user.score_predicted as number | null | undefined) || "—"}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #e1e8ed" }}>
                    <td style={{ padding: "10px 8px", color: "#0f1419" }}>User Type</td>
                    <td style={{ padding: "10px 8px", color: "#0f1419", textAlign: "center" }}>
                      {(user.user_type as string | null | undefined) || "—"}
                    </td>
                    <td style={{ padding: "10px 8px", color: "#0f1419", textAlign: "center" }}>
                      No Data
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #e1e8ed" }}>
                    <td style={{ padding: "10px 8px", color: "#0f1419" }}>Percentile</td>
                    <td style={{ padding: "10px 8px", color: "#0f1419", textAlign: "center" }}>
                      —
                    </td>
                    <td style={{ padding: "10px 8px", color: "#0f1419", textAlign: "center" }}>
                      {(user.percentile as number | null | undefined) || "—"}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #e1e8ed" }}>
                    <td style={{ padding: "10px 8px", color: "#0f1419" }}>Date</td>
                    <td style={{ padding: "10px 8px", color: "#0f1419", textAlign: "center", fontSize: 11 }}>
                      22nd Dec
                    </td>
                    <td style={{ padding: "10px 8px", color: "#0f1419", textAlign: "center", fontSize: 11 }}>
                      22nd Dec
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "10px 8px", color: "#0f1419" }}>GatiMitra Segment</td>
                    <td style={{ padding: "10px 8px", color: "#0f1419", textAlign: "center" }}>
                      {(user.user_cft_segment as string | null | undefined) || "—"}
                    </td>
                    <td style={{ padding: "10px 8px", color: "#0f1419", textAlign: "center" }}>
                      —
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Approval Rate */}
            <div
              style={{
                background: "#f0f9ff",
                padding: "24px",
                borderRadius: 12,
                border: "1px solid #bfdbfe",
              }}
            >
              <div style={{ color: "#1e40af", fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
                Approval rate of Bill: {(user.approval_rate_bill as number | null | undefined) || 0}%
              </div>
              <div style={{ fontSize: 13, color: "#0f1419", lineHeight: 1.8 }}>
                <div>
                  Total transaction:{" "}
                  <span style={{ fontWeight: 600 }}>{(user.total_transaction as number | null | undefined) || 0}</span>
                </div>
                <div>
                  Total approved:{" "}
                  <span style={{ fontWeight: 600 }}>{(user.total_approved as number | null | undefined) || 0}</span>
                </div>
                <div>
                  Total disapproved:{" "}
                  <span style={{ fontWeight: 600 }}>{(user.total_disapproved as number | null | undefined) || 0}</span>
                </div>
                <div>
                  Total fraud:{" "}
                  <span style={{ fontWeight: 600 }}>{(user.total_fraud as number | null | undefined) || 0}</span>
                </div>
                <div>
                  Total grace:{" "}
                  <span style={{ fontWeight: 600 }}>{(user.total_grace as number | null | undefined) || 0}</span>
                </div>
                <div>
                  Total pending:{" "}
                  <span style={{ fontWeight: 600 }}>{(user.total_pending as number | null | undefined) || 0}</span>
                </div>
              </div>
            </div>

            {/* Wallet Balance */}
            <div
              style={{
                background: "#ffffff",
                padding: "20px",
                borderRadius: 12,
                border: "1px solid #e1e8ed",
              }}
            >
              <div style={{ color: "#0f1419", fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
                Wallet balance:{" "}
                <span style={{ color: "#1e40af" }}>₹ {(user.account_balance as number | null | undefined) || 0}</span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#708090",
                  maxHeight: 200,
                  overflowY: "auto",
                  lineHeight: 1.8,
                }}
              >
                <div>Date - 02/03/25 Amount - 15</div>
                <div>Date - 02/03/25 Amount - 11.88</div>
                <div>Date - 02/03/25 Amount - 289</div>
                <div>Date - 28/02/25 Amount - 11.88</div>
                <div>Date - 28/02/25 Amount - 15</div>
                <div>Date - 28/02/25 Amount - 1</div>
                <div>Date - 28/02/25 Amount - 289</div>
                <div>Date - 16/12/24 Amount - 14</div>
                <div>Date - 16/12/24 Amount - 15</div>
                <div>Date - 16/12/24 Amount - 11.11</div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "flex-start" }}>
            {[
              "Bill",
              "GatiMitra Order",
              "Voucher",
              "GatiMitra Pay",
              "Table Booking",
              "Issued Coupons",
              "Linked Tickets",
              "PG TXN",
            ].map((btn) => (
              <button
                key={btn}
                style={{
                  background: "linear-gradient(135deg, #2ec4b6, #1b9c85)",
                  color: "#ffffff",
                  border: "none",
                  padding: "11px 26px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.25s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow =
                    "0 10px 24px rgba(46, 196, 182, 0.35)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = "none";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
                }}
              >
                {btn}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
