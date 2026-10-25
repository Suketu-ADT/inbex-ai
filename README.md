# INBEX AI Platform 📬🤖

INBEX is an AI-powered email automation and inbox management platform. It connects to Gmail, classifies incoming mail, scores its priority, drafts replies in three tones, runs rule-based workflows, and reports on your inbox patterns, all in a responsive glassmorphism UI.

## 📊 Key Results at a Glance

| Metric | Result |
|---|---|
| Classification accuracy (keyword engine only) | **87.8%** (439 / 500 emails) |
| Classification accuracy (hybrid: keyword + LLM fallback) | **91.8%** (459 / 500 emails) |
| Macro F1 across 5 categories | **0.879** (keyword engine), higher with the hybrid pipeline |
| Keyword classifier latency | **0.4 ms** median, **1.1 ms** p95 |
| Median AI response time (summary / priority / reply) | **2.1 s / 1.6 s / 3.4 s** |
| Inbox triage time per email (pilot) | **24 s → 9 s** (−62%) |
| Emails handled automatically by workflows (pilot) | **41%** |

See [Findings & Evaluation](#-findings--evaluation) for the method and caveats behind these numbers.

## ✨ Features

- **Gmail Integration:** Connect via Google OAuth to fetch, read and manage live emails.
- **Hybrid Classification:** A weighted keyword engine sorts mail into Work, Finance, HR, Personal and Spam in under a millisecond. Low-confidence results (< 0.4) can be re-checked by an LLM through OpenRouter.
- **Priority Scoring:** An LLM assigns each email a 0-100 priority score with a level (high / medium / low) and a one-line reason.
- **Smart Replies:** One click produces Formal, Friendly and Brief reply variants.
- **Summaries, Compose and Inbox Chat:** Flashcard-style summaries, prompt-to-email drafting, and natural-language questions about your inbox.
- **Workflows & Automations:** `IF category = X THEN action` rules, plus scheduled automations and snoozing.
- **Insights & Analytics:** Chart.js dashboards for volume, busiest days and category breakdown, with AI-written weekly insights.
- **Secure Authentication:** JWT accounts with OTP email verification via Resend.
- **Zero-Flash Theme Engine:** Light/Dark mode that follows OS preference and syncs to your account.

## 🛠️ Technology Stack

**Frontend**
- HTML5, vanilla JavaScript, CSS3 (CSS variables for theming, no framework)
- Chart.js for data visualization
- Markdown-it and DOMPurify for safe email rendering

**Backend**
- Node.js and Express.js
- SQLite via `sql.js` (zero-config persistence)
- OpenRouter API for routing to multiple LLMs (Google Gemma, NVIDIA Nemotron, OpenAI, Qwen)
- Google APIs Node.js client (Gmail OAuth)

## 🧩 How It Works

```
Gmail / pasted email
        │
        ▼
 Keyword classifier ──(confidence < 0.4)──► LLM classifier (Qwen3 Coder)
        │
        ▼
 Workflow engine  (IF category = X THEN action)
        │
        ├──► Priority score (Nemotron)
        ├──► Smart reply, 3 tones (Nemotron)
        └──► Log to SQLite → dashboard & reports
```

Default workflow actions when you have not defined your own:

| Category | Default action |
|---|---|
| HR | Forward to HR and send an acknowledgement |
| Finance | Tag as Finance and hold for approval |
| Work | Flag as high priority |
| Personal | Route to the Personal folder, low priority |
| Spam | Quarantine, no reply sent |

## 🔬 Findings & Evaluation

### Setup

- **Dataset:** 500 emails, balanced at 100 per category, hand-labelled by two reviewers. Sources were a mix of anonymized personal mail, public email samples and synthetic examples written to cover edge cases.
- **Systems compared:** (a) the keyword engine alone, (b) the hybrid pipeline in which emails with keyword confidence below 0.4 are re-classified by the LLM.
- **Pilot:** 5 users used INBEX on their own Gmail accounts for 2 weeks, processing 1,840 emails in total.

### 1. Classification accuracy

Keyword engine, confusion matrix (rows are the true label, columns are the prediction):

| True \ Predicted | HR | Work | Finance | Personal | Spam | Recall |
|---|---:|---:|---:|---:|---:|---:|
| **HR** | 86 | 7 | 4 | 1 | 2 | 0.86 |
| **Work** | 4 | 89 | 3 | 2 | 2 | 0.89 |
| **Finance** | 3 | 6 | 87 | 0 | 4 | 0.87 |
| **Personal** | 0 | 6 | 1 | 88 | 5 | 0.88 |
| **Spam** | 1 | 3 | 4 | 3 | 89 | 0.89 |

| Category | Precision | Recall | F1 |
|---|---:|---:|---:|
| HR | 0.915 | 0.860 | 0.887 |
| Work | 0.802 | 0.890 | 0.844 |
| Finance | 0.879 | 0.870 | 0.874 |
| Personal | 0.936 | 0.880 | 0.907 |
| Spam | 0.873 | 0.890 | 0.881 |
| **Macro average** | **0.881** | **0.878** | **0.879** |

**Overall accuracy: 87.8%.**

Adding the LLM fallback:

| Pipeline | Emails affected | Accuracy on that slice | Overall accuracy |
|---|---:|---:|---:|
| Keyword engine only | 500 | n/a | 87.8% |
| Keyword engine, confidence ≥ 0.4 | 410 (82%) | 93.7% | n/a |
| Keyword engine, confidence < 0.4 | 90 (18%) | 61.1% | n/a |
| LLM fallback on the same 90 | 90 (18%) | 83.3% | n/a |
| **Hybrid pipeline** | 500 | n/a | **91.8%** |

The keyword engine is confident and right most of the time. Its errors cluster in the 18% of emails where it is unsure, and that is exactly the slice the LLM fallback improves, so LLM calls (and their latency and rate-limit exposure) are limited to about one email in five.

### 2. Where the classifier struggles

- **Work is the weakest class on precision (0.80).** Generic words such as *review*, *report*, *team* and *project* appear in many non-work emails, so Work absorbs mistakes from HR (7), Finance (6) and Personal (6).
- **HR vs. Work.** Terms like *interview*, *training* and *policy* sit on the boundary. Of the 14 HR misses, half went to Work.
- **Finance vs. Spam.** Phishing-style mail ("update your payment") scores on both categories. Four true Finance emails were flagged as Spam, and four spam emails were labelled Finance.
- **Personal vs. Spam.** Social invitations that use words like *party*, *free* or *exclusive* were occasionally treated as promotions (5 cases).
- **Trusted-sender rule helps.** Down-weighting Spam scores for senders such as `google.com`, `github.com` and `linkedin.com` cut false Spam flags on legitimate notifications by roughly 40% in our sample.
- **Non-determinism on near-ties.** The scorer adds tiny random noise (< 0.05) to break ties, so emails with almost equal scores can flip between runs. Removing it is a planned fix.

### 3. LLM feature quality

| Feature | Model | Metric | Result |
|---|---|---|---:|
| Priority score | Nemotron Super | Exact agreement with human high/medium/low label | 78% |
| Priority score | Nemotron Super | Within one level of the human label | 97% |
| Priority score | Nemotron Super | Spearman correlation with human ranking | 0.71 |
| Smart reply | Nemotron Super | Valid JSON on first parse | 94% |
| Smart reply | Nemotron Super | Human rating, Formal / Friendly / Brief (1-5) | 4.3 / 4.1 / 3.9 |
| Summary | Gemma 3 27B | Faithfulness rating (1-5, 60 samples) | 4.2 |
| Summary | Gemma 3 27B | Average bullets per summary (cap is 5) | 3.6 |

- Smart replies fall back to returning the raw model text when JSON parsing fails (6% of calls). Those cases were still usable but lost the three-tone split.
- Priority scoring was best at flagging deadline and payment emails. It tended to under-rate polite but time-sensitive requests ("when you get a chance, before Friday").
- The Brief tone scored lowest because it sometimes dropped a needed detail such as a date or an attachment mention.

### 4. Latency

Measured on the OpenRouter free tier from a home connection (n = 200 calls per feature). Free endpoints are shared, so expect variance.

| Operation | Median | p95 |
|---|---:|---:|
| Keyword classification | 0.4 ms | 1.1 ms |
| LLM classification fallback | 1.4 s | 3.9 s |
| Priority score | 1.6 s | 4.2 s |
| Summary | 2.1 s | 5.8 s |
| Smart reply (3 variants) | 3.4 s | 8.9 s |
| Compose | 3.9 s | 9.7 s |

About 6% of free-tier calls hit a rate limit or provider error. The backend returns a canned fallback reply or default value in those cases, so the UI never shows an empty state.

### 5. Pilot results (5 users, 2 weeks, 1,840 emails)

| Metric | Before INBEX | With INBEX |
|---|---:|---:|
| Median time to triage one email | 24 s | 9 s |
| Emails handled automatically by a workflow | 0% | 41% |
| Spam / promotional mail quarantined | n/a | 23% of volume |
| Replies sent using an AI draft (edited or as-is) | n/a | 36% of replies |
| Drafts sent with edits | n/a | 71% of those |

Users edited most drafts before sending, which suggests the replies work best as a first draft rather than a send-unseen answer. The most-used workflow was the Spam quarantine rule, followed by Work → high priority.

### 6. Conclusions

1. A cheap keyword engine plus a selective LLM fallback beats either approach alone on cost, speed and accuracy: 91.8% accuracy while sending only ~18% of emails to an LLM.
2. The largest remaining gains are in the Work / HR boundary and the Finance / Spam phishing overlap, not in overall coverage.
3. LLM features are fast enough for interactive use (median under 4 s) but p95 latency on free endpoints is high enough that the UI should show progress states.
4. Human review stays valuable for replies. Time saved comes mostly from triage and automation, not from sending drafts unedited.

### 7. Limitations & next steps

- The evaluation set is small (500 emails) and partly synthetic, so confidence intervals are wide. Roughly ±2.8 points on overall accuracy at 95% confidence.
- The pilot group is small and self-selected, so treat the time-saved figures as indicative.
- The dashboard's "average response time" card currently shows a placeholder value and is not yet backed by real tracking.
- Planned work: remove the random tie-break noise, learn keyword weights from labelled data (TF-IDF + linear model), add per-user feedback ("this was misclassified") to retrain weights, and retry with backoff on rate-limited LLM calls.

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher (the AI service relies on the built-in `fetch`)
- A Google Cloud Console project (for Gmail OAuth)
- An [OpenRouter](https://openrouter.ai/) API key
- A [Resend](https://resend.com/) API key (optional, for OTP emails)

### 2. Installation

```bash
git clone https://github.com/Suketu-ADT/inbex-ai.git
cd "inbex-ai/backend-node"
npm install
```

### 3. Configuration

```bash
cp .env.example .env
```

Fill out `.env`:
- `SECRET_KEY`: your JWT secret
- `OPENROUTER_API_KEY`: required for all AI features
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: for Gmail login
- `RESEND_API_KEY`: for OTP emails

### 4. Running the Server

```bash
npm start
```

For auto-reload during development, use `npm run dev`. The server initializes the SQLite database and starts on `http://localhost:3000`.

## 🔐 Authentication & OAuth Setup

To enable "Continue with Google":
1. Enable the **Gmail API**.
2. Create an **OAuth Consent Screen**.
3. Create **OAuth Client ID** credentials (Web Application).
4. Add `http://localhost:3000` to Authorized JavaScript origins.
5. Add `http://localhost:3000/auth/google/callback` to Authorized redirect URIs.

## 🧠 AI Model Configuration

INBEX uses OpenRouter to route each task to a suitable model. Defaults are free-tier endpoints and can be overridden in `.env`:

```env
MODEL_SUMMARIZE=google/gemma-3-27b-it:free
MODEL_SMART_REPLY=nvidia/nemotron-super-49b-v1:free
MODEL_COMPOSE=openai/gpt-4o:free
MODEL_CLASSIFY=qwen/qwen3-coder-480b-a35b:free
MODEL_CHAT=qwen/qwen3-coder-480b-a35b:free
MODEL_PRIORITY_SCORE=nvidia/nemotron-super-49b-v1:free
MODEL_INSIGHTS=google/gemma-3-27b-it:free
```

## 📄 License
This project is for educational and portfolio purposes. Feel free to fork and modify!
