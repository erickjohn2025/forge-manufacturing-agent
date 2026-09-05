# Africa's Talking Marketplace submission — Manu

## Basic information

- **Name:** Manu — AI Manufacturing Operations Agent
- **Slug:** `manu-manufacturing-operations-agent`
- **Short description:** Turn manufacturing outcomes into coordinated plans, supplier SMS conversations, approvals, production work, and fulfilment.
- **Logo:** `public/manu-logo.png` (1024 × 1024) or `public/manu-logo.svg`
- **Repository:** https://github.com/erickjohn2025/forge-manufacturing-agent
- **Demo:** https://manu-71389945847.africa-south1.run.app
- **Privacy:** https://manu-71389945847.africa-south1.run.app/privacy
- **Terms:** https://manu-71389945847.africa-south1.run.app/terms

## Long description

Manu is manufacturing software you do not have to learn. A manufacturer states an operational outcome in natural language, and Manu plans and coordinates the work across PLAN, SOURCE, MAKE, and DELIVER.

Manu deterministically calculates demand, finished-goods availability, production requirements, BOM material needs, safety stock, and shortages. When material is missing, it contacts approved suppliers through Africa's Talking SMS, understands natural-language quotations, rejects offers that violate hard constraints, and requests human approval when purchasing policy requires it. It then creates the purchase order, tracks incoming stock separately from available stock, coordinates receiving and production, allocates finished goods, and verifies that every target order is ready before completing the objective.

Africa's Talking connects the agent to suppliers, operators, approvers, and customers using ordinary phones. Manufacturers can operate the complete hero workflow by SMS, while the web interface provides a live, auditable objective timeline and focused decision cards. Every operational mutation is performed by validated domain tools; the language model never writes operational data directly.

The product is tenant-configurable for food, beverage, garment, furniture, cosmetics, packaging, and similar manufacturers. Products, materials, BOMs, policies, inventory, suppliers, users, phone numbers, currency, timezone, and purchasing limits are business data rather than hard-coded behavior.

## Technical configuration

- **Container port:** `8080`
- **Database:** PostgreSQL required
- **Health endpoint:** `/api/health`
- **Inbound SMS callback:** `/api/webhooks/africas-talking/sms`
- **Delivery callback:** `/api/webhooks/africas-talking/delivery`

Required environment variables: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `APP_URL`, `PUBLIC_WEBHOOK_BASE_URL`, `AFRICASTALKING_USERNAME`, `AFRICASTALKING_API_KEY`, `AFRICASTALKING_INBOUND_NUMBER`, and `OPENAI_API_KEY`.

Optional environment variables: `AFRICASTALKING_SENDER_ID`, `OPENAI_MODEL`, `AUTO_PURCHASE_LIMIT`, `DEFAULT_SAFETY_STOCK`, `BUSINESS_NAME`, `CURRENCY`, `DEMO_MODE`, `SMS_PROVIDER`, `ZENOPAY_API_KEY`, and `ZENOPAY_API_BASE`.

## Categorization

- **Africa's Talking product:** SMS
- **Industry:** Other — Manufacturing
- **Secondary capabilities:** AI, supply chain, inventory, procurement, production planning, order management

## Pricing

- **Plan:** SME Pilot
- **Currency:** TZS
- **Amount:** 120,000
- **Frequency:** Monthly
- **Description:** One isolated Manu instance for one manufacturer, including the operations console, SMS-driven workflows, supplier RFQs, approvals, production coordination, fulfilment readiness, and audit history. Africa's Talking messaging and AI usage charges are paid separately by the customer.

## Submission checklist

- Push the production image to the AT-Container registry using credentials from the Marketplace submission form.
- Create the plugin using the information above and upload the PNG logo.
- Declare PostgreSQL and all required environment variables.
- Add the SME Pilot pricing plan and select SMS plus Other/Manufacturing.
- Review and accept the Marketplace Terms of Service and Privacy Policy.
- Submit, confirm success, and track approval under Manage Plugins.
