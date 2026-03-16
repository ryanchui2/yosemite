# Datasets for Fraud Detection

ARRT can be trained or benchmarked on public synthetic financial fraud datasets. In-repo demo data is used for the dashboard and agent-scan flow.

## In-repo and demo data

- **Dashboard / scan**: Seed data (e.g. GlobalTex) is loaded via migrations. Use `transactions_demo.csv` and `vendor_sanctions_demo.csv` for the scripted demo (see [scripts/demo/DEMO_SCRIPT.md](../scripts/demo/DEMO_SCRIPT.md)).
- **Agent-scan demo**: [scripts/demo/transactions_agent_scan_demo.csv](../scripts/demo/transactions_agent_scan_demo.csv) — small synthetic batch with `transaction_id`, `order_id`, `customer_id`, `amount`, `timestamp` for testing Railtracks agent-scan (anomaly, Benford, duplicates, graph, velocity). Upload via the dashboard “Run full AI fraud analysis” flow.
- **Document fraud**: [synthetic_bec_dataset/](../synthetic_bec_dataset/) — BEC-related assets (clean, tampered, logos) for document/VLM demos.

## Public synthetic financial fraud datasets

Use these for training or benchmarking Isolation Forest, velocity-style rules, or other models (not required to run ARRT).

| Dataset                                              | Description                                                                                                                                             | Link                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Synthetic Financial Fraud Dataset (Kaggle)**       | Synthetic financial fraud data for classification and anomaly detection.                                                                                | [Kaggle: Synthetic Financial Fraud Dataset](https://www.kaggle.com/datasets/umitka/synthetic-financial-fraud-dataset)                                      |
| **Synthetic Fraud Detection (Hugging Face)**         | Large-scale synthetic fraud detection data (millions of rows) for model training and benchmarking.                                                      | [Hugging Face: vitaliy-sharandin/synthetic-fraud-detection](https://huggingface.co/datasets/vitaliy-sharandin/synthetic-fraud-detection)                   |
| **Global FinTech Fraud Transactions (Hugging Face)** | ~100k synthetic fintech transaction records (amounts, types, countries, devices, fraud labels). Good for experiments; check license for commercial use. | [Hugging Face: global-dataset-lab/global-fintech-fraud-transactions](https://huggingface.co/datasets/global-dataset-lab/global-fintech-fraud-transactions) |

## Schema for agent-scan / upload

For CSV uploads used with the backend or agent-scan, include at least:

- `transaction_id` (string, unique)
- `order_id` (optional)
- `customer_id` or `customer_name` (optional; used for duplicates and velocity)
- `amount` (numeric)
- `timestamp` (optional; ISO or date string for velocity analysis)

Additional fields (e.g. `cvv_match`, `address_match`, `ip_is_vpn`, `card_present`) improve rule-based and anomaly scoring when present.
