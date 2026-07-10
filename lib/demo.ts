/**
 * Demo corpus. The SQL migration seeds `documents` rows, schemas, one
 * extraction and destinations, but not `document_pages` (which the review pane
 * and search need). The /api/seed route uses this to fill in pages + chunks
 * idempotently, and to create any missing demo rows so the app is fully
 * functional the moment the schema is applied.
 */

export interface DemoDoc {
  filename: string;
  mime_type: string;
  file_size: number;
  doc_type: string;
  doc_type_confidence: number;
  ocr_used: boolean;
  pages: string[]; // one string of text per page
}

const INVOICE_PAGE_1 = `ACME CORP
123 Industrial Way, Springfield, IL 62701
billing@acmecorp.com

INVOICE

Invoice Number: INV-0042
Invoice Date: May 1, 2026
Due Date: May 31, 2026
Bill To: Globex LLC, 500 Market St, San Francisco, CA

Description               Quantity    Unit Price      Amount
Widget A                  20          150.00          3000.00
Widget B                  12          150.00          1800.00

Subtotal                                              4800.00
Tax (9%)                                              430.00
Total                                                 5230.00

Payment due within 30 days. Thank you for your business.`;

const INVOICE_PAGE_2 = `ACME CORP — Terms & Conditions

1. Payment is due within thirty (30) days of the invoice date.
2. Late payments accrue interest at 1.5% per month.
3. All widgets carry a 12-month limited warranty.
4. Remit payment to Acme Corp, Account 000123456, Routing 021000021.

Questions about this invoice? Contact billing@acmecorp.com.`;

const RECEIPT_PAGE = `BLUE BOTTLE COFFEE
Store #14 — Downtown

Date: 2026-06-10
-------------------------------
Cappuccino            5.50
Almond Croissant      4.25
-------------------------------
Subtotal              9.75
Tax                   0.85
Total                 10.60

Payment Method: Visa ****4242
Thank you for your visit!`;

const REPORT_PAGE_1 = `Q1 2026 BUSINESS REVIEW
Prepared by Finance — April 2026

Executive Summary
Revenue for Q1 2026 reached $4.2M, up 18% year over year. Gross
margin improved to 61%. Operating expenses were held flat while
headcount grew 6%. Cash position remains strong at $9.1M.

Key metrics: ARR $16.8M, net revenue retention 112%, churn 1.4%.`;

const CONTRACT_PAGE_1 = `MASTER SERVICES AGREEMENT

This Agreement is entered into between Acme Corp ("Provider") and
Globex LLC ("Client") effective June 1, 2026.

1. Scope of Services. Provider shall deliver the services described
   in each Statement of Work.
2. Term. This Agreement remains in effect for twelve (12) months
   and renews automatically unless terminated with 30 days notice.
3. Fees. Client shall pay the fees set forth in each SOW within 30
   days of invoice.
4. Confidentiality. Each party shall protect the other's confidential
   information.`;

const SPREADSHEET_PAGE = `# March Expenses
Category,Vendor,Amount,Date
Software,Figma,45.00,2026-03-03
Travel,United,320.50,2026-03-11
Meals,Sweetgreen,18.75,2026-03-12
Office,Staples,64.20,2026-03-19
Software,Notion,10.00,2026-03-22
Total,,458.45,`;

export const DEMO_DOCS: DemoDoc[] = [
  {
    filename: "invoice_acme_may2026.pdf",
    mime_type: "application/pdf",
    file_size: 184320,
    doc_type: "invoice",
    doc_type_confidence: 0.97,
    ocr_used: false,
    pages: [INVOICE_PAGE_1, INVOICE_PAGE_2],
  },
  {
    filename: "scan_receipt_coffee.jpg",
    mime_type: "image/jpeg",
    file_size: 512000,
    doc_type: "receipt",
    doc_type_confidence: 0.91,
    ocr_used: true,
    pages: [RECEIPT_PAGE],
  },
  {
    filename: "q1_2026_report.pdf",
    mime_type: "application/pdf",
    file_size: 2097152,
    doc_type: "report",
    doc_type_confidence: 0.88,
    ocr_used: false,
    pages: [REPORT_PAGE_1],
  },
  {
    filename: "vendor_contract_draft.docx",
    mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    file_size: 98304,
    doc_type: "contract",
    doc_type_confidence: 0.85,
    ocr_used: false,
    pages: [CONTRACT_PAGE_1],
  },
  {
    filename: "expenses_march.xlsx",
    mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    file_size: 45056,
    doc_type: "spreadsheet",
    doc_type_confidence: 0.79,
    ocr_used: false,
    pages: [SPREADSHEET_PAGE],
  },
];
