# CategorAIze: An AI-Based Customizable Email Classification and Prioritization System

> **Basis of this version.** Every claim about the system was checked against `origin/main` (commit `4fe30dcae`, 2026-11-21), which is what Cloud Build deploys to production, plus its test reports under `docs/testing/` and `fastapi_core/eval/RESULTS.md`. The local `main` branch is 538 commits behind and was not used.
> No open author checks remain. A change log at the end of this file lists every edit and its source; delete it before submission.

---

# Chapter 1
# Introduction

## 1.1 Project Context

Email remains one of the primary channels of professional communication in the Philippines and across the world. As of 2025, Filipino internet users access email at rates placing the Philippines among the most digitally active nations in Southeast Asia (DataReportal, 2025). Despite the ubiquity of email, the volume of messages that professionals receive has grown to a point where the inbox itself has become a source of cognitive burden rather than a productivity tool. Research on email overload consistently finds that professionals experience significant stress and reduced well-being as a consequence of high email load — a phenomenon that extends across work stressors, email categories, and individual coping styles (Kern et al., 2024).

The problem is compounded in the Philippine context by a linguistic reality that existing email management tools do not adequately address. Filipino professionals communicate in a fluid mixture of English, Filipino (Tagalog), and mixed-code Tagalog-English commonly called Taglish. Research on Tagalog-English code-switching in social media has documented this register extensively, confirming that it differs structurally and lexically from either monolingual English or monolingual Filipino text (Herrera et al., 2022). Gmail's built-in category tabs (Primary, Social, Promotions, Updates, Forums) and Outlook's Focused Inbox are designed for English-dominant inboxes and rely on sender-domain heuristics and opaque machine-learned signals that do not generalize to the multilingual, code-switched emails that Filipino professionals routinely send and receive.

Beyond categorization, existing tools fail to extract the actionable content embedded in email. A message announcing a project deadline, requesting a deliverable, or scheduling a meeting contains structured information — a task to be completed, a date by which it must be done — that the recipient must manually parse and transfer to a task manager or calendar. No mainstream email client automatically surfaces these spans as structured data linked to the email record.

CategorAIze addresses both gaps. It is a fork of the open-source email management system Inbox Zero (elie222/inbox-zero), extended with a custom multilingual natural language processing pipeline. The system automatically assigns each incoming email to one of eight fixed semantic categories defined by the researchers, extracts task and deadline spans as structured data, and adapts its categorization to each user's email vocabulary over time through a relevance feedback mechanism. All processing is performed with strict attention to the data privacy requirements of Republic Act No. 10173 (Data Privacy Act of the Philippines) and the Google API Services User Data Policy.

The development of CategorAIze is situated at the intersection of software engineering, natural language processing, and information assurance. As a software engineering contribution, it demonstrates that a production-grade, multilingual email intelligence system can be constructed by extending an open-source foundation rather than building from scratch, and that this approach reduces implementation risk while preserving a maintainable upgrade path. As a contribution to applied NLP, it demonstrates that zero-shot multilingual sentence embeddings are sufficient for high-accuracy categorization of Filipino professional email without requiring labeled training data for each category. Research on multilingual models for code-switching has established that encoder-based multilingual models generalize to unseen language pairs, including Tagalog-English, more effectively than monolingual fine-tuned systems (Winata et al., 2021), providing the theoretical basis for this design choice.

## 1.2 Statement of the Problem

Despite the prevalence of email as a professional communication tool in the Philippines and the availability of intelligent email management systems in the global market, no existing system adequately addresses the specific needs of Filipino professionals managing multilingual inboxes. This study identifies three specific gaps.

First, existing email categorization systems are not designed for the multilingual, code-switched nature of Filipino professional communication. Gmail's category tabs and Outlook's Focused Inbox rely on signals that are optimized for English-dominant inboxes. Neither system provides categories that map to the professional email taxonomy relevant to Filipino workers — distinguishing, for example, between work task assignments, school-related communication, job search correspondence, and finance and billing notifications in a single unified inbox view.

Second, existing email clients do not extract task and deadline information from email bodies as structured, queryable data. When a manager sends an email containing an action item and a deadline, the recipient must manually identify and record both. This manual extraction is error-prone and time-consuming, and no mainstream email client provides automatic, structured span extraction for task and date entities in multilingual email.

Third, the personalization mechanisms available in existing email clients are opaque and non-adaptive. Google's categorization is a black-box model that cannot be inspected, corrected, or personalized at the individual user level. Users cannot signal to Gmail that a particular sender or email pattern belongs in a different category, and there is no mechanism for the system to learn from explicit user corrections. This opacity reduces user trust and limits the system's utility for professionals whose email patterns differ from the population on which the model was trained.

CategorAIze addresses these three problems by implementing: (1) zero-shot multilingual categorization using sentence embeddings that generalize across English, Taglish, and Filipino without category-specific training data; (2) automatic TASK and DATE span extraction using a trained sequence labeling model; and (3) per-user category adaptation using an interpretable online relevance feedback algorithm.

## 1.3 Objectives of the Study

### General Objective

The general objective of this study is to design, develop, and evaluate CategorAIze, a multilingual email categorization system for Filipino professionals, implemented as a fork of the Inbox Zero open-source platform extended with a custom natural language processing service.

### Specific Objectives

1. To implement zero-shot email categorization across eight fixed semantic categories using the Multilingual Sentence-BERT model (paraphrase-multilingual-MiniLM-L12-v2), evaluated against keyword-rule and ablated-system baselines on a purpose-built bilingual dataset.
2. To implement automatic extraction of TASK spans (action items) and DATE/DEADLINE spans from email bodies using a Bi-directional LSTM with Conditional Random Field (Bi-LSTM-CRF) sequence tagger trained on the study's dataset.
3. To implement per-user category centroid adaptation using the Rocchio relevance feedback algorithm, allowing the system to refine its categorization to each user's email vocabulary without retraining the underlying model.
4. To evaluate the integrated system against four configurations (B1 through B4) using macro-averaged F1, entity-level span F1, and 95% bootstrap confidence intervals, with performance reported separately for English, mixed-code, and Filipino email.
5. To validate the usability of the system through user testing with eight participants using the System Usability Scale (SUS) and the Single Ease Question (SEQ). *(Planned; not yet conducted. See Section 3.9.3.)*

## 1.4 Significance of the Study

This study contributes to multiple beneficiary groups across academic, professional, and societal dimensions.

Filipino knowledge workers and professionals stand to benefit directly from a system that reduces the time spent manually sorting and processing email. By surfacing task deadlines and category assignments automatically, CategorAIze reduces the cognitive load associated with inbox management and supports more intentional prioritization of work, addressing email overload effects that are well-documented in the occupational health literature (Kern et al., 2024).

Students and academic institutions benefit from the school category and the task-extraction feature, which are specifically designed to surface assignment deadlines, examination notices, and academic correspondence that students frequently receive alongside professional email in a shared inbox.

Future researchers in Filipino and multilingual NLP benefit from the purpose-built dataset of 430 bilingual fictional emails spanning English, Taglish, and Filipino, annotated with category labels, priority levels, task spans, and date spans. The dataset provides a reusable benchmark complementing existing resources such as TweetTaglish (Herrera et al., 2022) and Batayan (Montalan et al., 2025) by targeting the professional email domain rather than social media or general benchmark tasks.

The software engineering research community benefits from the demonstration that a fork-based development strategy applied to a production-grade open-source platform can produce a research-quality system with well-defined evaluation, without requiring a greenfield implementation that duplicates infrastructure already solved by the upstream project.

Data privacy practitioners and legal researchers benefit from the study's application of RA 10173 compliance principles to an AI-powered email system, providing a documented reference implementation of privacy-by-design in the Philippine regulatory context.

## 1.5 Scope and Limitations

### Scope

CategorAIze is scoped to the following boundaries. The system processes email from mailboxes connected via OAuth 2.0. The evaluation and all development testing used Gmail. The deployed application also offers Microsoft sign-in and Outlook mailbox connection, inherited from Inbox Zero and enabled in production on 2026-11-20; the Outlook path was not evaluated in this study. Email is classified into eight fixed categories: work_tasks, meetings, school, job_search, finance_billing, promotions, alerts, and personal. These categories were defined by the researchers based on a thematic analysis of Filipino professional email types and are the only taxonomy that was evaluated. In the deployed application, the eight categories are the defaults each mailbox starts with. A user can also create, rename, re-describe, and delete categories per mailbox, confirm categories proposed from clusters of their own mail, and accept suggested labels from a fixed library of 12 templates when nothing matches. Only the eight-category taxonomy was evaluated; behavior on user-defined categories was not. The system processes email in three language registers: English, mixed-code Tagalog-English (Taglish), and predominantly Filipino (Tagalog). All model development and evaluation use a synthetic dataset of 430 fictional emails authored by the research team; no real user email was used for training or for the reported evaluation. User testing is planned with eight participants drawn from the DLSU-D College of Information Technology and Engineering.

### Limitations

The study acknowledges the following limitations. The synthetic dataset may not fully represent the distributional complexity of real-world Filipino professional email, and performance estimates derived from it should be treated as upper bounds on real-world performance. The test set contains 100 emails, which limits the statistical power of per-category performance estimates for rare categories. Inter-annotator agreement (Cohen's kappa) was measured on the full 100-email test set in two blind second-labeling exercises, one by three team members and one by a single additional labeler (Section 3.3.1). The planned user testing sample of eight participants is below the threshold typically required for statistically powered usability research and should be interpreted as formative rather than summative evaluation. The system is evaluated only on English, Taglish, and Filipino (Tagalog); performance on other Philippine languages (Cebuano, Ilocano, Hiligaynon) is not assessed.

## 1.6 Definition of Terms

**Zero-shot classification** refers to the assignment of an input to a category without having trained on labeled examples of that category. In this study, zero-shot classification is achieved by measuring the cosine similarity between the embedding of an email and the embeddings of natural-language descriptions of each category, with the category whose description is most similar being assigned.

**Sentence embedding** refers to a fixed-length numerical vector that encodes the semantic meaning of a sentence or passage of text. Sentence embeddings produced by models such as Sentence-BERT place semantically similar texts close together in the embedding space, enabling similarity-based retrieval and classification (Reimers & Gurevych, 2019).

**BIO tagging** (Begin-Inside-Outside tagging) is a labeling scheme used in sequence labeling tasks. Each token in a sequence is assigned one of three tag prefixes: B (the beginning of an entity span), I (inside an entity span), or O (outside any entity span). In this study, BIO tags are applied to two entity types: TASK and DATE.

**Relevance feedback** is a technique from information retrieval in which a system updates its representation of a query based on feedback about which retrieved documents were relevant (Manning et al., 2008). In this study, the Rocchio algorithm is used to update per-user category centroids in embedding space based on user confirmations and corrections of category labels.

**Code-switching** refers to the practice of alternating between two or more languages within a single conversation or text. In the Philippine context, code-switching between English and Filipino (Tagalog) is pervasive in professional and informal communication (Herrera et al., 2022).

**Taglish** is the informal term for mixed-code communication that alternates between Tagalog and English within sentences, phrases, or turns. It is the dominant register of semi-formal digital communication among Filipino professionals.

**Macro-averaged F1** is a classification evaluation metric computed by calculating the F1 score for each class independently and then averaging across all classes with equal weight. Macro-averaging gives equal weight to each class regardless of its frequency in the test set, which is appropriate when evaluating performance across imbalanced categories.

**Row-level security (RLS)** is a database access control mechanism that restricts which rows a given authenticated user can read or write, based on the user's identity and a set of policy rules. In this study, RLS is enforced at the Supabase Postgres layer, through a runtime database role without the bypass privilege, to prevent one authenticated user from accessing another user's email data or embeddings.

---

# Chapter 2
# Review of Related Literature and Studies

## 2.1 Email Overload and Productivity

The problem of email overload has become increasingly acute in an era of always-on digital communication. Kern et al. (2024) provide one of the most comprehensive recent investigations of the phenomenon, identifying distinct email classes — informational, task-requiring, and social — and demonstrating that the interaction between high email volume and task-requiring email specifically predicts elevated stress and reduced well-being among knowledge workers. Their study distinguishes between email load as a quantitative measure and the qualitative burden imposed by emails that demand action, a distinction that directly informs the design of CategorAIze's eight-category taxonomy, which explicitly separates obligation-bearing categories (work_tasks, meetings, job_search) from informational ones (promotions, alerts).

Complementing this clinical research, the Microsoft 365 Work Trend Index (Microsoft, 2022) tracked communication patterns across tens of millions of knowledge workers globally, documenting a sustained increase in after-hours email engagement and meeting load, and finding that professionals increasingly struggle to protect time for focused work. These findings are particularly relevant to the Philippine context, where high mobile internet penetration (DataReportal, 2025) means that email intrudes continuously into personal time rather than being confined to desktop working hours.

The email overload literature establishes a clear motivational basis for automated email triage. By automatically sorting incoming email into semantically meaningful categories and extracting actionable deadlines from email bodies, CategorAIze aims to reduce the obligation-identification burden that Kern et al. (2024) identify as the primary driver of email-related stress — allowing users to attend first to messages that require a response and defer informational email without manual sorting.

## 2.2 Email Classification and Categorization Systems

Automated email classification has evolved significantly over the past decade. Early keyword-rule approaches, while interpretable, produce brittle classifiers that fail on email written outside their keyword vocabulary, particularly in multilingual inboxes. Machine learning approaches using bag-of-words TF-IDF features and logistic regression substantially improved classification accuracy on English email corpora but require labeled training data for each target category and do not generalize to languages or category taxonomies not represented in the training corpus.

The Gmail category tabs system, introduced in 2013, represents the most widely deployed email classification system in the world. While its architecture is not publicly documented, its behavior — classifying email into Primary, Social, Promotions, Updates, and Forums tabs — relies on a combination of sender-domain signals, header metadata, and learned content features. These signals are optimized for English-dominant inboxes and cannot be inspected or corrected by users. The system has not been updated to reflect the professional email taxonomies — such as separating school correspondence from work tasks, or job search from general professional email — that Filipino knowledge workers require.

Pre-trained transformer models have produced state-of-the-art results on a range of email and text classification benchmarks. However, fine-tuning these models requires substantial labeled data for each target category and each language, which does not exist for Filipino professional email at any scale. The zero-shot approach adopted in CategorAIze, using multilingual sentence embeddings to match email text against category descriptions in a shared semantic space, eliminates this requirement entirely and has been shown to achieve competitive classification performance without any category-specific labeled examples (Veeranna et al., 2023).

## 2.3 Multilingual and Low-Resource NLP

The Philippines presents a challenging multilingual NLP environment. Filipino (Tagalog-based) is an Austronesian language with a morphology that differs substantially from the Indo-European languages that dominate NLP benchmarks. English is the medium of instruction in Philippine higher education and the dominant language of formal professional writing, but Taglish code-switching is pervasive in digital communication, creating a register that falls between English and Filipino and is handled poorly by models trained on either language alone.

Montalan et al. (2025) introduce Batayan, the first comprehensive Filipino NLP benchmark for evaluating large language models, covering tasks including sentiment analysis, natural language inference, and reading comprehension across Filipino and English. Their evaluation reveals that even state-of-the-art multilingual LLMs exhibit substantial performance gaps on Filipino tasks relative to English, underscoring the low-resource challenge. For CategorAIze, Batayan confirms that the Filipino-language capability of general multilingual models cannot be assumed without evaluation on Filipino test data — motivating the per-language performance breakdown built into the study's evaluation design.

Research on code-switching NLP for Tagalog-English has advanced through dedicated datasets. Herrera et al. (2022) introduce TweetTaglish, the first large-scale annotated corpus of Tagalog-English code-switched social media text, covering part-of-speech tagging and named entity recognition. Their work demonstrates that the structural properties of Taglish — mid-sentence language switches, matrix language ambiguity, and hybrid morphology — require language resources distinct from both monolingual Filipino and English corpora.

Winata et al. (2021) investigate whether multilingual pretrained models such as mBERT and XLM-R are effective in code-switching settings across multiple language pairs, finding that multilingual models outperform monolingual models on code-switched benchmarks but that performance varies significantly by language pair and task type. Their findings inform the selection of paraphrase-multilingual-MiniLM-L12-v2 as the sentence encoder for CategorAIze, as this model's multilingual pretraining on parallel corpora makes it better suited to Taglish than any monolingual alternative.

## 2.4 Sentence Embeddings and Zero-Shot Classification

The development of dense sentence embeddings as a representation for semantic similarity tasks has been a major advance in NLP. Reimers and Gurevych (2019) introduced Sentence-BERT (SBERT), a modification of the BERT architecture that uses siamese and triplet network structures to produce sentence embeddings that are directly comparable by cosine similarity. SBERT substantially outperformed prior sentence embedding methods on semantic textual similarity benchmarks while producing embeddings in a fraction of the inference time required by cross-encoder BERT models.

The multilingual extension of SBERT, introduced by Reimers and Gurevych (2020), uses knowledge distillation to transfer the semantic similarity structure of a monolingual English teacher model to a multilingual student model trained on parallel corpora spanning 50+ languages. The resulting multilingual model produces embeddings aligned across languages in a shared semantic space, enabling cross-lingual semantic similarity without language-specific fine-tuning. This property is essential for CategorAIze, where the category descriptions are written in English but the emails to be classified may be written in Tagalog, Taglish, or English.

Zero-shot text classification using sentence embeddings has been validated across a range of tasks and languages. Veeranna et al. (2023) provide a systematic evaluation of zero-shot text classification methods, finding that embedding similarity approaches using multilingual sentence encoders achieve competitive or superior performance compared to natural language inference-based approaches when category descriptions are semantically precise. This finding directly informs the category description engineering process described in Section 3.7. For CategorAIze, the zero-shot embedding approach means that the category taxonomy can be revised by updating natural-language descriptions without retraining any model.

## 2.5 Named Entity Recognition and Sequence Labeling

Named entity recognition (NER) is the task of identifying and classifying spans of text that refer to entities of predefined types. The standard formulation of NER as a sequence labeling problem over BIO-tagged token sequences enables both span detection and entity type classification in a single inference pass. Lample et al. (2016) introduced the neural architecture that became the standard for NER: a bidirectional LSTM with a CRF output layer, optionally combined with character-level CNN embeddings. The bidirectional LSTM captures both left and right context for each token, while the CRF ensures globally consistent tag sequences by modeling transition probabilities between adjacent tags and decoding with the Viterbi algorithm.

The CRF output layer is particularly important for the TASK and DATE span extraction task in CategorAIze, because it prevents the model from producing invalid BIO sequences — for example, an I-TASK tag following a B-DATE tag — which are a common failure mode of models with independent per-token classification heads. The application of Bi-LSTM-CRF to email-specific entity types — task action items and temporal expressions — is distinct from standard NER benchmarks. Professional email combines imperative constructions that signal task obligations ("please submit," "ipasa mo," "kindly send") with temporal expressions that mix absolute dates, relative expressions ("bukas," "sa Biyernes"), and deadline framing ("due by," "bago mag-"), all of which require domain-specific training data. The annotated dataset constructed for this study provides this training signal for the Filipino professional email domain.

## 2.6 Relevance Feedback and Personalization

Relevance feedback is a technique from information retrieval in which the system updates its model of a user's information need based on explicit or implicit signals about which retrieved documents were relevant. The Rocchio algorithm (Rocchio, 1971), one of the earliest and most influential relevance feedback methods, updates a query vector by adding a weighted sum of relevant document vectors. Manning et al. (2008) provide a comprehensive treatment of Rocchio feedback in the vector space retrieval context, demonstrating that even minimal relevance signals consistently improve retrieval performance and that the algorithm's interpretability — the centroid is a weighted average of relevant document vectors — is an advantage over black-box ranking models.

Kern et al. (2024) further observe that email stress is greatest when the system's categorization does not match the user's own mental model of which messages are urgent — an alignment problem that population-level trained classifiers inherently cannot solve at the individual user level. This finding motivates the per-user adaptation mechanism at the core of CategorAIze's design: rather than relying solely on a shared zero-shot model, the system uses Rocchio feedback to shift each user's category centroids toward the specific vocabulary and sender patterns that characterize urgent email in that user's inbox.

CategorAIze adapts the Rocchio algorithm to the category centroid adaptation problem. Each category of each connected mailbox keeps one centroid vector in the Supabase pgvector store (Section 3.5.4). When a user confirms or corrects a category assignment, the centroid is updated according to the Rocchio formula. This approach is interpretable — the centroid is a weighted average of confirmed email embeddings in that category — and computationally efficient, requiring no model retraining and operating in O(d) time per update where d = 384. Centroids are kept per mailbox and per category, so a user with two connected mailboxes has two independent sets.

## 2.7 Data Privacy and Compliance in AI Systems

The processing of personal communication data by AI systems raises significant data privacy concerns. In the Philippines, the primary legal framework governing the collection, storage, and processing of personal information is Republic Act No. 10173, the Data Privacy Act of 2012 (Republic Act No. 10173, 2012). RA 10173 establishes the rights of data subjects (access, correction, erasure, and objection), the obligations of personal information controllers (lawful basis, purpose limitation, data minimization, and proportionality), and the enforcement authority of the National Privacy Commission.

The National Privacy Commission of the Philippines issued guidelines in 2023 specifically addressing the use of artificial intelligence systems that involve personal data processing, affirming that AI-powered tools must comply with the same data minimization, purpose limitation, and consent requirements as conventional data processing systems (National Privacy Commission, 2023). These guidelines directly apply to CategorAIze, which processes email content — personal communication data — on behalf of its users.

Google's API Services User Data Policy (Google, 2024) imposes additional constraints on applications that access Gmail data via the Gmail API. The Limited Use requirements prohibit using Gmail data to train models shared across users or for purposes beyond providing the service to the authenticated user. CategorAIze is designed to comply with both RA 10173 and Google's Limited Use requirements. The application stores, for each analyzed email, the subject, a snippet, the latest reply text (up to 8,000 characters), a summary, the extracted action text, and the text of each extracted span. These fields are encrypted at the application layer (AES-256-GCM) before they are written to the database, so they are not stored in plaintext; the sender address, identifiers, and embeddings are not encrypted because lookups and similarity search need them. The FastAPI NLP service is stateless and logs no email content. Users are presented with an informed consent screen at first login and may opt out without losing access to the application's other features, and a user can export or erase their data (Section 3.11).

## 2.8 Synthesis

The literature reviewed in this chapter establishes the theoretical and empirical foundations for CategorAIze's design and identifies the gap that the study addresses.

Research on email overload (Section 2.1) motivates the system's focus on the obligation-versus-information distinction embodied in the eight-category taxonomy and validates the design decision to surface task and deadline spans as structured data rather than leaving them embedded in unstructured email bodies. Kern et al. (2024) establish that it is specifically task-requiring email, not volume alone, that drives email-related stress — a distinction the taxonomy directly encodes.

Research on email classification (Section 2.2) establishes that keyword-rule approaches are insufficient for the multilingual, code-switched email that Filipino professionals send and receive, and informs the selection of zero-shot embedding-based classification as the approach most likely to generalize without category-specific labeled data.

Research on multilingual and low-resource NLP (Section 2.3) establishes the specific challenges of Filipino and Taglish NLP, documented through TweetTaglish (Herrera et al., 2022), Batayan (Montalan et al., 2025), and code-switching evaluation (Winata et al., 2021), and justifies the selection of a multilingual sentence encoder pre-trained on parallel corpora as the foundation for CategorAIze's categorization component.

Research on sentence embeddings and zero-shot classification (Section 2.4) provides the theoretical and empirical basis for the zero-shot categorization approach, grounded in the original SBERT work (Reimers & Gurevych, 2019) and its multilingual extension (Reimers & Gurevych, 2020), and validated for zero-shot settings by Veeranna et al. (2023).

Research on NER and sequence labeling (Section 2.5) establishes the Bi-LSTM-CRF (Lample et al., 2016) as the appropriate architecture for TASK and DATE span extraction and informs the BIO tagging scheme used in the study's dataset.

Research on relevance feedback (Section 2.6) provides the algorithmic foundation for the Rocchio-based per-user personalization mechanism, grounded in Rocchio (1971) and Manning et al. (2008), and motivates the need for user-level personalization through evidence from Kern et al. (2024) that individual email urgency perception diverges from population-level trained signals.

Research on data privacy (Section 2.7) establishes the legal and ethical framework within which CategorAIze operates — RA 10173 (Republic Act No. 10173, 2012), the NPC AI guidelines (National Privacy Commission, 2023), and Google's Limited Use policy (Google, 2024).

The gap that CategorAIze fills is the absence of any prior system that combines all of the following in a single integrated platform: multilingual email categorization designed for Filipino code-switched text, structured extraction of task and deadline entities from email bodies, interpretable per-user personalization via an online relevance feedback algorithm, and compliance with the Philippine Data Privacy Act and Google's Limited Use requirements. No prior work identified in the literature addresses this combination. CategorAIze is designed to fill this gap as a research contribution to the Filipino NLP and software engineering communities.

---

# Chapter 3
# Research Methodology

## 3.1 Research Design

This study adopts a constructive research design. The artifact is CategorAIze, a fork of the open-source email platform Inbox Zero (elie222/inbox-zero) extended with a stateless FastAPI NLP service. The artifact categorizes Filipino professionals' email into eight fixed categories, extracts TASK and DATE spans, computes a calendar-conflict flag, and adapts category centroids from user corrections.

The research proceeds in three phases.

**Phase 1: Foundation and scoping.** The researchers evaluated Inbox Zero to decide which features to keep, disable, or replace. A fork was chosen over a greenfield build because the upstream project already provides the Next.js interface, Gmail OAuth, and a Redis-backed job queue. Out-of-scope features were disabled at the routing layer rather than deleted, to keep the upstream merge path open. The eight-category taxonomy was fixed in this phase from a thematic analysis of email types.

**Phase 2: Dataset and model development.** A 430-email bilingual corpus was constructed (Section 3.3). Three components were developed on the training and development splits: (a) zero-shot categorization with a multilingual Sentence-BERT encoder, with a centroid adjustment tuned on dev; (b) a Bi-LSTM-CRF tagger for TASK and DATE spans; (c) a multinomial logistic regression priority model. A register model was also trained but was not promoted (Section 3.5.5).

**Phase 3: Integration and evaluation.** The NLP service was integrated with the Next.js application over an internal REST API and both services were deployed to Google Cloud Run. The system was evaluated once on the frozen 100-email test split against four configurations (B1 to B4, Table 3.3), with macro-F1, span F1, per-language breakdowns, and 95% bootstrap confidence intervals. Component tests (312 cases), a system test campaign against production, and a 50-user load test were then run and are reported in Section 3.9. The second-labeler agreement check is reported in Section 3.3.1. User testing has not been conducted.

### 3.1.3 Development Tools and Technologies

Table 3.0 lists the tools and technologies used, with versions taken from the production branch (`main`).

**Table 3.0.** Development tools and technologies.

| Layer | Tool or technology | Where it is used |
|---|---|---|
| Web application | Next.js 16 (TypeScript), inherited from Inbox Zero | `apps/web/` |
| Interface styling | Tailwind CSS 3.4 | `apps/web/` |
| Interface language support | Lingui 6 (message catalogs) | `apps/web/locales/` |
| Database access | PostgreSQL (Supabase, pgvector) through Prisma 7 | `apps/web/prisma/schema.prisma` |
| Authentication | better-auth 1.7; Google and Microsoft OAuth 2.0 | `apps/web/` |
| Background jobs | Upstash Redis 1.41 and QStash 2.12 | `apps/web/` |
| NLP service | FastAPI (Python), served with Uvicorn | `fastapi_core/` |
| Sentence encoder | sentence-transformers, `paraphrase-multilingual-MiniLM-L12-v2` | `fastapi_core/` |
| Sequence tagger | PyTorch (CPU) with pytorch-crf 0.7.2 | `fastapi_core/` |
| Priority and register models | scikit-learn (logistic regression) | `fastapi_core/` |
| Language identification and dates | langdetect, dateparser, tzdata | `fastapi_core/` |
| Testing | pytest (NLP service); Vitest 4 and Playwright 1.62 (web); Locust (load) | `fastapi_core/`, `apps/web/`, `fastapi_core/system_tests/load/` |
| Containers and deployment | Docker; Google Cloud Build and Cloud Run | `docker/`, `fastapi_core/Dockerfile`, `cloudbuild.yaml` |

### 3.1.4 Configuration and Integration Practice

The project followed an incremental, branch-based development cycle. Configuration management and integration worked as follows, as recorded in the repository history.

**Version control and branching.** All work is in one Git repository forked from Inbox Zero. The upstream project is kept as a second remote, so upstream fixes can be merged into the fork (for example, the merge of `upstream/main` into `feature/prd-v7-inbox-zero-parity`). Each piece of work was developed on its own branch and merged into `main` only when it was ready: foundation and scoping, the NLP service and its wiring to the web application (`feat/web-nlp-wiring`), the dataset, evaluation and learned models (`feat/dataset-eval-learned-models`), and encryption, masking and row-level security (`feat/phase-11-encryption-masking-rls`). `main` is the production branch. Out-of-scope upstream features were disabled at the routing layer rather than deleted, which kept the upstream merge path open (Section 3.1, Phase 1).

**Configuration.** Behavior that differs between environments is set through environment variables and files outside the repository, not in code: secrets, database and Redis addresses, the internal key shared by the two services, and the field-encryption key are not committed. Tuned model settings that belong to the system (the centroid parameters and thresholds in `fastapi_core/config/tuned.json`, and the model folders `models/tagger/v6`, `models/priority/v1` and `models/register/v1` with their metrics and model cards) are versioned in the repository, so a result can be traced to the exact configuration that produced it. Database changes are Prisma migrations kept in the repository. A local setup runs through Docker Compose files, and the production images use `docker/Dockerfile.prod` (web) and `fastapi_core/Dockerfile` (NLP service).

**Integration.** The two services are integrated over a typed internal REST contract: the web application calls the NLP service through a typed client, and requests are authenticated with an internal key. The NLP service was developed and tested on its own first (component tests, then the frozen-test-set evaluation), then wired into the web application, then tested together (system campaign against production). When a merge combined several branches (`release/merge-fixed`), the combined result was re-checked before deployment.

**Build and deployment.** A push to `main` triggers Google Cloud Build (`cloudbuild.yaml`), which builds the web image, stores it in Artifact Registry, and deploys it to Cloud Run. The NLP service is deployed separately and by hand from `fastapi_core`, so the two services can be released independently. The inherited GitHub workflows (unit tests and a build check) are configured to run on pushes and pull requests to `main`, but the Cloud Build deployment does not wait for them, and no workflow covers the NLP service. The NLP service's tests (Pytest) and the system and load tests (Locust) were run by the team and are reported in Section 3.9. The repository therefore has no automatic gate between a merge to `main` and deployment, which is a limitation (Section 3.12).

## 3.2 System Architecture

CategorAIze has two services: a Next.js application and a stateless FastAPI NLP service, connected by an internal REST API authenticated with an X-Internal-Key header. The service rejects requests without a valid key with HTTP 401, and fails closed when no key is configured. Failed checks are counted and logged without the presented key.

**Next.js application.** Inherited from Inbox Zero and extended with CategorAIze modules. It handles OAuth 2.0 sign-in and mailbox connection, retrieves messages through the provider API, applies PII masking, calls the NLP service, stores the results, and renders the inbox. Row-level security policies restrict each user's rows in the database, which the application reaches through a runtime role (`categoraize_app`) that has no bypass privilege.

**FastAPI NLP service.** Stateless: it holds no user data between requests and writes to no database. The service receives the masked subject and body and returns the category, TASK and DATE spans with resolved dates, priority, register, and the calendar-conflict flag. Logs record identifiers and counts, never email content; a scan of three days of production logs (20,000 entries) found no tokens, keys, database URLs, or message bodies. Request size and rate limits are enforced, and no CORS middleware is installed, so browsers cannot call the service directly.

**Supabase Postgres with pgvector.** Stores, per analyzed email, the subject, snippet, latest-reply text (up to 8,000 characters), summary, extracted action text, ranked categories, priority factors, the extracted spans (with their text and source), and 384-dimensional vectors: per-email embeddings and per-user sender and category centroids, indexed for cosine search. The text fields (subject, snippet, body text, summary, action text, span text) are encrypted at the application layer with AES-256-GCM (random 12-byte IV, 16-byte tag, per-column keys derived with HKDF-SHA256, key identifier `p1`). The sender address, identifiers, and embeddings are not encrypted. A read-only check of the production database found 826 encrypted values and no plaintext in the encrypted columns, and every stored OAuth access and refresh token was encrypted.

**Upstash Redis.** Queues background jobs inherited from Inbox Zero. CategorAIze code does not set the 24-hour key expiry that earlier drafts stated, so no such expiry is claimed.

**Deployment.** The web application (service `categoraize`, region asia-southeast3) is built by Cloud Build from the `main` branch of the repository and deployed to Cloud Run. The NLP service (service `categoraize-nlp`, region asia-southeast1, one instance always running, at most two) is deployed separately from the `fastapi_core` directory. Vercel was used earlier and is paused.

**PII masking.** Before text leaves the Next.js application, Philippine mobile numbers are replaced with [PHONE], SSS, PhilHealth, and TIN numbers with [GOV_ID], and payment-card-shaped digit groups that pass the Luhn check with [CARD]. Dates, amounts, and order numbers are left unchanged. Only counts of masked items are kept. Email addresses are not masked by the current implementation. The same rules are implemented in TypeScript and in Python and are tested against a shared set of test vectors so that both implementations behave identically.

**Request flow.** A mailbox notification job is dequeued; the application fetches the message; PII masking runs; the masked text is sent to the NLP service; the service returns its result; the application encrypts and stores it and updates the inbox view.

## 3.3 Dataset

**Source.** No public benchmark covers the eight-category taxonomy with Filipino code-switching and without personal data. The researchers built a corpus of 430 fictional emails. Senders, companies, amounts, and personal details are invented. No real inbox was accessed.

**Provenance of labels.** The labels were written by the research team with AI assistance and are stored with `human_reviewed = false` on every record. Section 3.3.1 reports two second-labeler checks against them.

**Categories.** work_tasks, meetings, school, job_search, finance_billing, promotions, alerts, personal. Each has a natural-language description (`data/categories.json`) embedded at inference time.

**Splits (Table 3.1).**

| Split | Size | Construction |
|---|---|---|
| Train | 300 | Template-synthetic: slot-filled from category-language templates (100 English, 100 Taglish, 100 Filipino) |
| Dev | 30 | Hand-written; 10 per language; used only for tuning |
| Test | 100 | Hand-written (34 English, 33 Taglish, 33 Filipino); used for the reported evaluation |

Train and dev/test share no template phrasing: the maximum 3-gram Jaccard overlap between train and dev/test is 0.27, and an exact-overlap validator reports zero shared text. The test bodies do not appear in any training file (checked by text match against the data directory).

**Schema.** id, split, language (en, mixed, tl), subject, body, sender_role, is_vip, received_at, gold_category, gold_spans (TASK/DATE with character offsets and resolved dates), gold_priority (1 to 5), gold_register, calendar_busy, gold_calendar_conflict, human_reviewed.

**Important limitation.** The priority, register, and category labels in train are fixed per template, so models trained on train can learn template shortcuts. Scores on train and dev overstate performance on real mail. The test split is the number to report.

### 3.3.1 Inter-Annotator Agreement

The 100 test emails were labeled a second time in two separate blind exercises, and both are reported. In each, the labeler worked from a blank sheet without access to the gold labels or to any system output, and labeled category, priority (1 to 5), and register. Agreement was computed against the AI-authored gold labels before any gold label was changed. **Exercise A is the primary result reported in this paper:** it is the lower and more conservative figure, it has three labelers and bootstrap intervals, and it is documented in the committed `RESULTS.md`. Exercise B is reported as a supplementary check and is the one that drove the adjudication below.

**Exercise A: team labels (2026-11-19).** Three team members labeled about a third of the emails each (34, 33, and 33), scored with `eval/human_review.py` (`review/team_review_2026-11-19/`). These are the numbers in `fastapi_core/eval/RESULTS.md`.

**Table 3.2a.** Agreement between the gold labels and the team's second labels (95% bootstrap interval in brackets).

| Measure | All (n = 100) | English (n = 34) | Taglish (n = 33) | Filipino (n = 33) |
|---|---|---|---|---|
| Category Cohen's kappa | 0.805 [0.719, 0.874] | 0.865 | 0.791 | 0.757 |
| Category exact agreement | 0.830 | 0.882 | 0.818 | 0.788 |
| Priority quadratic-weighted kappa | 0.753 [0.676, 0.813] | 0.870 | 0.690 | 0.687 |
| Priority exact agreement | 0.360 | 0.588 | 0.242 | 0.242 |
| Priority within one level | 0.960 | 1.000 | 0.939 | 0.939 |
| Register Cohen's kappa | 0.457 [0.298, 0.611] | 0.247 | 0.491 | 0.581 |

The most frequent category disagreements in this exercise (gold to team) were alerts to work_tasks (5), meetings to work_tasks (3), finance_billing to alerts (3), personal to alerts (3), and work_tasks to meetings (2). These disagreements were not adjudicated.

**Exercise B: single second labeler (returned 2026-11-21).** After the team found that the blind sheet (`review/second_labeler_test_BLIND.csv`) still needed an independent labeler, the project owner gave it to one more person, who returned it filled (stored as `review/second_labeler_test_FILLED.csv`). It was scored with `scripts/kappa.py`, and the values below were recomputed from the stored file against the gold labels as they stood before the priority correction.

**Table 3.2b.** Agreement between the gold labels and the single second labeler.

| Measure | All (n = 100) | English (n = 34) | Taglish (n = 33) | Filipino (n = 33) |
|---|---|---|---|---|
| Category Cohen's kappa | 0.97 (exact agreement 97%) | 0.97 | 0.97 | 0.97 |
| Priority quadratic-weighted kappa | 0.79 (exact agreement 54%) | 0.88 | 0.64 | 0.86 |
| Register Cohen's kappa | 0.64 | 0.84 | 0.52 | 0.55 |

By the usual bands, category agreement is almost perfect, priority agreement is substantial, and register agreement is substantial overall but moderate in Taglish and Filipino. The sheet given to this labeler was the blind copy, which contains no gold labels and no system output, so the labeler could not see them. The labeler is not named in the repository.

**Why the two exercises differ.** Exercise B shows much higher category agreement (0.97) than Exercise A (0.81). They used different labelers, and the team members labeled with their own knowledge of the project, so the gap is not a measurement error in either. Read together, category labels are reliable under a careful second labeler, and the lower team figure shows where the guideline leaves room for judgment (alerts versus work_tasks, and lunch invitations). Priority and register are the labels to treat with most caution in both.

**Native-speaker review.** The team's native-speaker review (`review/native_speaker_review.csv` and the per-member `*_2_native.csv` sheets) covered 111 Taglish and Filipino items (test and train), each rated by one of the three team members, all of whom are native Filipino speakers, for naturalness on a 1-to-5 scale and marked correct or not correct for its labels. The mean naturalness was 3.73 (Taglish 3.86, Filipino 3.60), 45 items were rated 3 or lower, and six labels were marked as not correct (test-mixed-004, test-mixed-011, test-tl-002, test-tl-004, test-tl-010, train-mixed-017). The reviewers are native Filipino speakers but also members of the project team, so a review by a speaker outside the team has not been done.

**Adjudication and the priority correction.** Eight items where the Exercise B labeler disagreed by a category or by two or more priority levels were reviewed against `LABELING_GUIDELINE.md` (`review/adjudication_log.md`). The gold label stood on seven. The three parallel delivery notices (test-en-028, test-mixed-026, test-tl-026) were lowered from priority 3 to 2 by team decision, because no action is required, and this change is committed (`c66c845e1`). All four systems were re-run on the corrected gold, and Section 3.8 reports that run. The category, register, and span metrics are unchanged by it. The agreement values in both tables were measured before this change. Note that `RESULTS.md` still describes only Exercise A; Exercise B is documented in the adjudication log and can be reproduced from the stored sheet.

## 3.4 Preprocessing

**Language identification.** A lexicon rule step runs first: English and Tagalog keyword hits decide the language. The `langdetect` library is used only as a fallback for text the rules cannot place. Text that is neither English nor Tagalog is intended to be reported as unknown. Rules come first because `langdetect` is unreliable on short code-switched text. The language label is stored and used for per-language reporting. The component tests record two known failures here: a hyphenated Filipino form with an emoji is labeled Filipino instead of mixed (defect D-01), and a German sentence is labeled English instead of unknown (defect D-02).

**Normalization.** HTML tags are stripped for provider HTML payloads; text is normalized to Unicode NFC; whitespace is collapsed. The sentence encoder receives original case. The tagger receives lowercased text with a separate casing feature. A Taglish normalizer (about 200 dictionary entries) glosses common Filipino request, time, and politeness words for the rule-based components.

**Tokenization.** The encoder uses its own WordPiece tokenizer. The tagger uses whitespace tokenization with punctuation splitting; words are cut to at most 24 characters for the character CNN.

**Date resolution.** DATE spans are passed to a rule-based resolver (`app/nlp/date_codes`) that maps relative phrases such as "bukas" (tomorrow) and "sa Biyernes" (on Friday) to ISO dates anchored at the email's received time and the mailbox time zone. Date-only phrases default to 17:00. Ambiguous dates are flagged and excluded from deadline logic.

**Sequence length.** The NLP service applies no truncation of its own beyond request limits (at most 64 texts per embedding call and 20,000 characters per text). The web application keeps the latest reply of a message, at most 8,000 characters, for analysis and re-scoring. The sentence encoder uses the library default maximum sequence length for this model (128 word pieces), which the project code does not change. The 512-token and 256-token rules in earlier drafts do not exist in the code and are not claimed.

## 3.5 Core Components

### 3.5.1 Zero-Shot Categorization with Sentence-BERT and Centroid Adjustment

**Encoder.** `paraphrase-multilingual-MiniLM-L12-v2` (Reimers & Gurevych, 2020), used without fine-tuning, produces 384-dimensional L2-normalized vectors. The email vector is the normalized mean of its subject and sentence embeddings.

**Category centroids.** Each category has a centroid defined as:

c_k = normalize( α · d_k + β · m_k )

where d_k is the embedding of the category description ("name: description"), m_k is the normalized mean of the training emails in category k, and α and β are fixed parameters. In the evaluated configuration α = 1.0 and β = 4.0 (`config/tuned.json`), chosen on the dev split only from a grid of 1,225 settings (7 thresholds, 7 keyword weights, 5 role weights, 5 values of β). The grid was widened once and then frozen. This is a static, population-level adjustment. It does not depend on any individual user.

**Scoring.** For an email e:

score_k = cos(e, c_k) + w_kw · min(hits_k, 3)/3 + w_role · 1[sender role ∈ roles_k]

with keyword weight w_kw = 0.3 and role weight w_role = 0.02 (tuned on dev). The predicted category is argmax_k score_k if the maximum is at least τ = 0.35; otherwise no category is assigned. The threshold was chosen on dev from a grid of 0.00 to 0.35, and its neighbors gave the same dev score. Dev macro-F1 was 0.852 for the chosen setting against 0.198 for plain zero-shot (B2).

**Scope of the evaluation.** Per-user adaptation (Section 3.5.4) is part of the deployed application but was not part of the reported evaluation. B3 and B4 therefore measure the population-level centroid, not personalization.

### 3.5.2 Bi-LSTM-CRF Sequence Tagger (TASK and DATE Spans)

**Architecture.** A character CNN (30-dimensional character embeddings, 50 filters, kernel size 3) and a learned word embedding (100 dimensions, trained from scratch) and a casing feature are concatenated, passed through a bidirectional LSTM with 128 hidden units per direction and dropout 0.5, and decoded by a linear-chain CRF over BIO tags (B-TASK, I-TASK, B-DATE, I-DATE, O). Decoding uses Viterbi.

**Training data.** The deployed tagger (version v6) was trained on 5,000 synthetic emails generated by the team's generator (`fastapi_core/data/synthetic`), team-written examples (`data/team`), and LLM-generated Taglish and Filipino examples (2,230 examples in `data/llm/tagger.jsonl`, generated by a hosted open-weight LLM and recorded with their source in each line). Two copies of the LLM examples were used in the chosen configuration. Text from the frozen test split does not appear in any of these files.

**Hyperparameters (as trained).** Adam with learning rate 2×10⁻³; batch size 32; 12 epochs; word dropout 0.05; the epoch with the highest dev entity F1 was kept (no patience-based early stopping). Random seed 13 for training. Training runs on CPU.

**Selection.** Configurations were compared on dev entity F1. In the search recorded in `models/tagger/v6/metrics.json`, adding the LLM examples raised dev F1 from 0.770 (none) to 0.852 (one copy) and 0.873 (two copies); the two-copy configuration with 128 hidden units was kept. The tagger's own report also contains a "test" block labeled provisional; that is not the frozen 100-email split and is not reported as a result. Later versions v8 and v9 were trained but not promoted: v8 was weaker on dev, and v9 won on dev but lost on the older provisional test set and tagged sender-completed FYI text as TASK, which broke a Reply Zero test.

**Reported test result.** On the frozen 100-email test split, the tagger is evaluated only through the full system (B4, Section 3.8).

### 3.5.3 Priority Model

Priority is an integer from 1 (lowest) to 5 (highest). Two methods are compared:

- **Rules (B1 to B3):** a base priority from the category, raised by validated deadlines within the window (+2 within 24 hours or overdue, +1 within 72 hours), adjusted for sender role and VIP status, and changed by calendar conflicts.
- **Learned (B4):** multinomial logistic regression (scikit-learn, L2, C = 1.0, selected on dev from a grid of nine values; seed 7). Features: the 384-dimensional email embedding; one-hot sender role; VIP flag; has-TASK flag; deadline proximity (0 if no unambiguous deadline, 1 if due now, 0 at one week); similarity to the promotions description; and the register label. The model is trained on the 300-email train split. Guardrails apply after the model: a VIP sender with a TASK is at least P4, promotions are capped at P2, and a manual override always wins. It was promoted because it was not below the rule baseline on dev (dev QWK 0.589 against 0.535).

### 3.5.4 Per-User Centroid Adaptation (Rocchio Feedback)

In the deployed application, each category of each connected mailbox has a centroid stored as a pgvector vector (`CategorizeCategory.centroidEmbedding`, with a version counter). When a user confirms or corrects the category of an email, the service updates the centroid of the correct category and, when the email had a previous category, the centroid of the incorrect one:

- correct: c ← normalize(c + α · e), α = 0.20
- incorrect: c ← normalize(c − β · e), β = 0.15

where e is the normalized email embedding. If the subtraction would make the incorrect centroid a zero vector, the old centroid is kept, and a correction where the correct and incorrect categories are the same is rejected. The update uses no model retraining and costs O(d) per update with d = 384. Editing a category's description restarts its centroid from the new description, and confirming a discovered cluster as a new category starts its centroid at the cluster center. The default classification threshold stored per category is 0.35. After a correction, stored emails can be re-scored so that the change reaches earlier mail. A separate sender-category centroid table exists for sender-level matching and is not what the correction flow updates.

This is the Rocchio relevance-feedback form adapted to category centroids (Rocchio, 1971). It is implemented in `fastapi_core/app/algorithms/feedback.py` and covered by 10 component tests, but it is not part of the evaluation reported in Section 3.8. The reported evaluation uses the static centroid of Section 3.5.1. Evaluating the personalized update would require a simulated sequence of user corrections, which has not been run.

### 3.5.5 Register Model

The register label (formal, neutral, casual) is produced by rules over lexical cues: formal and casual term hits, the Filipino politeness particle "po," emoji, lowercase sentence starts, and exclamation marks. A multinomial logistic regression over the embedding and these cues was also trained (C = 100 chosen on dev), but it did not beat the rules on dev by a meaningful margin (macro-F1 0.813 against 0.769, a one-email difference). It was also run on test during the first evaluation pass, where rules were ahead (accuracy 0.85 against 0.78). The team then kept the rules as the production setting. Because this choice used test information, the register numbers on the test split are not a clean held-out estimate, and the paper reports this.

The register label is shown in the interface and is not used by the category model.

### 3.5.6 Calendar-Conflict Flag

The conflict flag is computed deterministically: a conflict exists when a resolved, unambiguous DATE falls inside a busy interval from the user's calendar. It is not a learned model and does not use subject-line patterns. In the deployed application, busy intervals are taken from every calendar connected under any of the user's mailboxes, and a calendar that fails to load is skipped with a warning so that priority is never lowered by missing data.

## 3.6 Rules Not Implemented

Earlier drafts described two guardrails that are not in the code: a calendar subject-line override (for example, subjects beginning "Invitation:") and a Philippine finance keyword override with a lower threshold of 0.25. Neither is part of the evaluated system, and this study does not claim them. They are listed here so that they are not reintroduced as results.

## 3.7 Training and Tuning Procedure

**Tuning rule.** Every choice of threshold, weight, centroid parameter, model regularization, and tagger configuration was made on the dev split. The test split was run for each system twice: once before the register decision and the priority gold correction, and once after both (the reported run, Section 3.8). The register decision is disclosed in Section 3.5.5 and the priority correction in Section 3.3.1.

**Category description authoring.** The category descriptions were revised by the team against dev macro-F1. This manual search is part of the method. The repository records the descriptions as a single committed version, so the number of revision rounds is not documented and none is claimed.

**Seeds.** Tagger training seed 13; priority model seed 7; the evaluation harness seeds Python and NumPy with 0. Model checkpoints and evaluation outputs are version-controlled in the repository. Re-scoring B4 on the frozen test split in the system test campaign reproduced all 292 metrics with no differences (S15-01).

**Hardware.** Training runs on CPU only (`training/train_lib.py`; no GPU is used). The machine model was not recorded, so none is claimed.

## 3.8 Evaluation Design and Results

**Corpus.** The frozen 100-email test split, reported from the second run on the corrected gold. Every number in this section is read from `fastapi_core/eval/results/*_test.json` and `eval/RESULTS.md` (generated by `eval/make_report.py`).

**Metrics.** Category macro-F1 and accuracy; priority exact agreement, within-one-level agreement, quadratic-weighted kappa, and mean absolute error; register accuracy; TASK, DATE, and micro span F1 with exact boundary and type matching; resolved-date accuracy; calendar-conflict accuracy.

**Confidence intervals.** 95% percentile bootstrap intervals from 1,000 resamples of emails with a fixed seed.

**Systems (Table 3.3).**

| System | Category | Tagger | Priority | Register |
|---|---|---|---|---|
| B1 | Keyword lists and sender role | Regex | Rules | Rules |
| B2 | Zero-shot Sentence-BERT, τ = 0.35, no boosts, no centroid adjustment | Regex | Rules | Rules |
| B3 | Sentence-BERT with dev-tuned centroid (α = 1, β = 4), keyword and role boosts | Regex | Rules | Rules |
| B4 | As B3 | Bi-LSTM-CRF v6 | Learned v1 | Rules |

B2 is not a TF-IDF classifier. The B2 result is the zero-shot embedding baseline, and the comparison B2 to B3 measures the value of the dev-tuned boosts and centroid. B3 to B4 measures the learned tagger and learned priority. Neither comparison measures per-user feedback.

**Table 3.4.** Test split, all languages (n = 100). Point estimate [95% CI].

| Metric | B1 | B2 | B3 | B4 |
|---|---|---|---|---|
| Category macro-F1 | 0.725 [0.625, 0.796] | 0.284 [0.180, 0.366] | 0.770 [0.681, 0.841] | 0.770 [0.681, 0.841] |
| Category accuracy | 0.680 [0.580, 0.770] | 0.190 [0.120, 0.270] | 0.770 [0.680, 0.850] | 0.770 [0.680, 0.850] |
| Priority exact | 0.360 [0.270, 0.450] | 0.340 [0.250, 0.430] | 0.370 [0.280, 0.460] | 0.420 [0.330, 0.520] |
| Priority within 1 | 0.870 [0.800, 0.930] | 0.810 [0.740, 0.880] | 0.880 [0.810, 0.930] | 0.870 [0.800, 0.930] |
| Priority QWK | 0.532 [0.365, 0.660] | 0.385 [0.219, 0.526] | 0.542 [0.366, 0.672] | 0.544 [0.385, 0.663] |
| Priority MAE (↓) | 0.800 [0.660, 0.950] | 0.880 [0.740, 1.030] | 0.780 [0.640, 0.920] | 0.720 [0.580, 0.860] |
| Register accuracy | 0.850 [0.780, 0.910] | 0.850 [0.780, 0.910] | 0.850 [0.780, 0.910] | 0.850 [0.780, 0.910] |
| TASK span F1 | 0.383 [0.250, 0.520] | 0.383 [0.250, 0.520] | 0.383 [0.250, 0.520] | 0.356 [0.264, 0.452] |
| DATE span F1 | 0.462 [0.345, 0.575] | 0.462 [0.345, 0.575] | 0.462 [0.345, 0.575] | 0.459 [0.351, 0.560] |
| Span micro-F1 | 0.430 [0.353, 0.513] | 0.430 [0.353, 0.513] | 0.430 [0.353, 0.513] | 0.408 [0.339, 0.476] |
| Resolved-date accuracy | 0.471 [0.357, 0.594] | 0.471 [0.357, 0.594] | 0.471 [0.357, 0.594] | 0.543 [0.426, 0.657] |
| Calendar-conflict accuracy | 0.990 [0.970, 1.000] | 0.990 [0.970, 1.000] | 0.990 [0.970, 1.000] | 1.000 [1.000, 1.000] |

**Table 3.5.** Category macro-F1 by language.

| Language | n | B1 | B2 | B3 | B4 |
|---|---|---|---|---|---|
| English | 34 | 0.765 [0.573, 0.883] | 0.456 [0.238, 0.578] | 0.806 [0.628, 0.917] | 0.806 [0.628, 0.917] |
| Taglish | 33 | 0.726 [0.507, 0.843] | 0.208 [0.071, 0.292] | 0.785 [0.594, 0.902] | 0.785 [0.594, 0.902] |
| Filipino | 33 | 0.684 [0.469, 0.812] | 0.083 [0.000, 0.167] | 0.722 [0.496, 0.854] | 0.722 [0.496, 0.854] |

**Interpretation.** B3 and B4 have identical category scores, so category assignment does not separate them. B4 is higher than B3 on exact priority agreement (0.42 against 0.37), but the intervals overlap widely (0.33–0.52 against 0.28–0.46), and the two are the same on quadratic-weighted kappa (0.544 against 0.542). B4 has lower mean absolute error (0.72 against 0.78) and is the same on within-one-level agreement (0.87 against 0.88). The clearest B4 gain is resolved-date accuracy (0.54 against 0.47), while its TASK span F1 is lower than B1 (0.36 against 0.38). Most intervals overlap, so differences between B1, B3, and B4 are not established at n = 100.

**Category errors (B4).** 23 of 100 emails are miscategorized. The largest confusion is school to work_tasks (5 of 13 gold school emails), then meetings to work_tasks (3 of 12) and job_search to meetings (3 of 9).

**Not performed.** A paired significance test between B3 and B4 was described in earlier drafts. It was not run, and no p-value is reported.

## 3.9 Testing Strategy and Validation Status

### 3.9.1 Component Tests

A component test campaign (`docs/testing/component_tests.md`, generated from the test runs) covers twelve components with 312 cases: 305 pass, 0 fail, and 7 are strict expected failures tied to open defects (2 in language detection, 5 in zero-shot category ranking of single hand-made probes). The components are language detection and normalization (15 cases), category classifier (32), date normalizer (25), Bi-LSTM-CRF tagger (12), priority model and guardrails (16), register classifier (9), calendar conflict (13), Rocchio feedback (10), category discovery (6), API layer (37), web application logic (93), and information-assurance checks for row-level security, export and erasure, and backup and restore (44). The PII masker is tested with shared vectors across TypeScript and Python.

Line coverage was 95.0% for the NLP service (target 80%) and 93.2% for the new web logic (target 70%). The 85% branch-coverage target in earlier drafts was not used; coverage was measured by line, and no coverage threshold is enforced in the pytest configuration.

### 3.9.2 System and Security Tests

A system test campaign was run against the production deployment (`docs/testing/system_tests.md`): 27 steps passed, 5 failed (each tied to a logged defect), and 29 were blocked because the dedicated Google and Microsoft test accounts had not been created, so every step that needs a signed-in mailbox has no evidence yet. The report's own verdict is no-go until those steps are run. What was verified:

- **Classification service.** Fifty test emails (17 English, 17 Taglish, 16 Filipino) were classified through the deployed NLP service; single-request latency was p50 491 ms and p95 1,002 ms, within the 2-second target. B4 re-scored on the frozen test split reproduced all 292 metrics with no differences.
- **Load.** 50 simulated users for 5 minutes against `/classify` and `/priority`: 2,602 requests, 0.0% errors, p50 2.1 s, p95 6.6 s, p99 63 s, 8.7 requests per second. The error-rate target (1% or less) was met; the p95 target of 2 seconds was **not** met (defect SYS-D06, with the service limited to two instances).
- **Security.** All 11 NLP endpoints rejected a missing or wrong key; OAuth scopes matched the least-privilege list; production field encryption, row-level security (forced, one policy per table, no bypass role), and token encryption were verified read-only; the secrets scan, `pip-audit`, and `pnpm audit` were run and triaged; and the log scan found no tokens or bodies. Failures: the NLP API documentation pages are public (SYS-D02), the web Content-Security-Policy allows `unsafe-inline` and `unsafe-eval` (SYS-D08), and the `X-Powered-By` header is sent (SYS-D03). A leftover link to the upstream project's documentation remains on the not-found page (SYS-D04).
- **Backup and recovery.** The encrypted backup of the local database was restored into a scratch database in 149 seconds with matching row counts, a verified checksum, and a tampered file refused. The daily schedule gives a worst-case RPO of 24 hours. The 3-2-1 rule is not fully met: both copies are local and there is no off-site copy (SYS-D07). Restoring a Supabase production backup was not tested.
- **Interface.** Mobile (390 px) pages had no sideways scroll, the sign-in page was keyboard-reachable, Lighthouse accessibility passed for the sign-in and privacy pages, and signed-out redirects and links behaved as expected.

Playwright was used for the browser steps. Steps that need a signed-in mailbox (multi-account, conflict badges, feedback loop, drafts, privacy-rights flows, cross-user isolation, and injection tests) are not yet evidenced.

### 3.9.3 User Testing

A usability study with eight participants is planned (five tasks, SUS and SEQ). No session data or SUS scores exist yet, so no usability result is reported. The study design and ethics review must be completed before data collection.

## 3.10 Non-Functional Requirements

Targets and what has been measured against them:

| Requirement | Target | Measured status |
|---|---|---|
| Categorization latency (p95) | < 2 seconds end-to-end | Single request to the NLP service: p95 1.0 s (met). Under 50 concurrent users: p95 6.6 s (not met). End-to-end through the web app: not measured. |
| NLP service availability | 99.5% monthly uptime | Not measured. |
| Recovery Point Objective (RPO) | 24 hours | Daily backup schedule gives 24 hours (met for the local database). |
| Recovery Time Objective (RTO) | 4 hours | Scratch-database restore took 149 seconds (met); Supabase production restore not tested. |
| Concurrent users (load target) | 50 simultaneous | Run with 0.0% errors; latency target missed. |
| Test coverage | 80% NLP, 70% new web logic (line) | 95.0% and 93.2%. |
| SUS score | ≥ 68 (Brooke, 1996) | Not measured; user study not conducted. |

## 3.11 Ethical Considerations and Data Privacy

**RA 10173.** The application processes personal information on behalf of users. Measures in the code and verified in testing: PII masking before NLP calls; no email content in NLP service logs; application-layer AES-256-GCM encryption of stored email text and OAuth tokens; row-level security through a runtime role without the bypass privilege; and a consent screen that blocks the app until the Terms and Privacy Policy are accepted, with a withdrawal option and a security log of consent events. The consent flow was checked end to end in the browser on a development build; the same check on production is blocked until the test accounts exist. Data export and erasure are implemented (export of the user's tables, deletion of rows, vectors, and Redis keys, revocation of Google tokens on deletion, and re-application of erasures after a restore) and the database-level behavior is covered by the 44 information-assurance component tests; the end-to-end production run of the erase and export steps is blocked for the same reason.

**Google API Limited Use.** Gmail data is used to provide the categorization service to the authenticated user. The training data used for the tagger, priority, and register models is fictional or synthetic. No real Gmail content was used for training or for the reported evaluation. Attachment filing and drafting features that call an external language model are gated by the user's external-AI consent and are off by default.

**Encryption in transit and at rest.** Application-layer AES-256-GCM is implemented for stored email text and OAuth tokens, with key identifier `p1`; the keys are held outside the repository. Disk encryption by the hosting provider is separate and is not claimed here.

**Research ethics.** The dataset is synthetic or fictional. Ethics review for the planned user study has not been completed.

## 3.12 Limitations

- **Labels.** Gold labels were AI-assisted (`human_reviewed = false` on every record). They were checked in three ways: three team members each labeled about a third of the 100 test emails blind (category kappa 0.81, priority quadratic-weighted kappa 0.75, register kappa 0.46; Table 3.2a, the primary result); one additional labeler labeled all 100 blind (Table 3.2b); and the the three team members, all native Filipino speakers, reviewed 111 Taglish and Filipino items for naturalness and label correctness (mean naturalness 3.73 of 5; six labels flagged and not corrected). Category and priority agreement are substantial and register agreement is weaker. Both the three-member check and the naturalness review were done by project members, so they do not cover bias shared by the team, and neither was repeated by a labeler or Filipino speaker outside the team.
- **Test size.** 100 emails; wide intervals; no per-category claim for rare categories.
- **Tagger training data.** The deployed tagger uses 5,000 synthetic plus LLM-generated and team-written examples. Its transfer to real mail is untested beyond the hand-written test split.
- **Personalization not evaluated.** The per-user Rocchio update is implemented but was not evaluated.
- **Register decision.** The register model was tested on test before being set aside.
- **Single encoder.** Only one multilingual encoder was evaluated.
- **Language scope.** English, Taglish, and Filipino only.
- **Providers.** Evaluation and testing used Gmail. Outlook connection is enabled in production but was not evaluated.
- **Stored email text.** The application stores encrypted subject, snippet, latest-reply text (up to 8,000 characters), and summary for analyzed emails; the privacy guarantee is encryption and access control, not absence of storage.
- **Testing gaps.** The system test campaign has 29 blocked steps pending test accounts; production load shows a p95 of 6.6 s against a 2 s target; the 3-2-1 backup rule is not fully met; and the user study has not been conducted.

---

# References

Brooke, J. (1996). SUS: A quick and dirty usability scale. In P. W. Jordan, B. Thomas, B. A. Weerdmeester, & A. L. McClelland (Eds.), *Usability evaluation in industry* (pp. 189–194). Taylor & Francis.

Cohen, J. (1960). A coefficient of agreement for nominal scales. *Educational and Psychological Measurement, 20*(1), 37–46.

DataReportal. (2025). *Digital 2025: The Philippines*. Datareportal.com. https://datareportal.com/reports/digital-2025-philippines

Google. (2024). *Google API services user data policy*. Google LLC. https://developers.google.com/terms/api-services-user-data-policy

Herrera, M., Aich, A., & Parde, N. (2022). TweetTaglish: A dataset for investigating Tagalog-English code-switching. In *Proceedings of the Thirteenth Language Resources and Evaluation Conference* (pp. 2090–2097). European Language Resources Association. https://aclanthology.org/2022.lrec-1.225

Kern, M., Ohly, S., Ďuranová, L., & Friedrichs, J. (2024). Drowning in emails: Investigating email classes and work stressors as antecedents of high email load and implications for well-being. *Frontiers in Psychology, 15*. https://doi.org/10.3389/fpsyg.2024.1439070

Kingma, D. P., & Ba, J. (2014). Adam: A method for stochastic optimization. *arXiv preprint arXiv:1412.6980*.

Lample, G., Ballesteros, M., Subramanian, S., Kawakami, K., & Dyer, C. (2016). Neural architectures for named entity recognition. In *Proceedings of NAACL-HLT 2016* (pp. 260–270). Association for Computational Linguistics.

Manning, C. D., Raghavan, P., & Schütze, H. (2008). *Introduction to information retrieval*. Cambridge University Press.

Microsoft. (2022). *2022 work trend index: Annual report*. Microsoft Corporation. https://www.microsoft.com/en-us/worklab/work-trend-index

Montalan, J. R., Layacan, J. P., Africa, D. D., Flores, R. I., Lopez, M. T., Magsajo, T. D., Cayabyab, A., & Tjhi, W. C. (2025). Batayan: A Filipino NLP benchmark for evaluating large language models. *arXiv preprint arXiv:2502.14911*. https://arxiv.org/abs/2502.14911

National Privacy Commission. (2023). *Guidelines on the use of artificial intelligence systems involving personal data processing*. Republic of the Philippines. https://www.privacy.gov.ph

Noreen, E. W. (1989). *Computer-intensive methods for testing hypotheses*. Wiley.

Reimers, N., & Gurevych, I. (2019). Sentence-BERT: Sentence embeddings using siamese BERT-networks. In *Proceedings of EMNLP 2019* (pp. 3982–3992). Association for Computational Linguistics.

Reimers, N., & Gurevych, I. (2020). Making monolingual sentence embeddings multilingual using knowledge distillation. In *Proceedings of EMNLP 2020* (pp. 4512–4525). Association for Computational Linguistics. https://aclanthology.org/2020.emnlp-main.365

Republic Act No. 10173. (2012). *Data Privacy Act of the Philippines*. Republic of the Philippines.

Rocchio, J. J. (1971). Relevance feedback in information retrieval. In G. Salton (Ed.), *The SMART retrieval system: Experiments in automatic document processing* (pp. 313–323). Prentice Hall.

Veeranna, S. P., Cho, J., Dernoncourt, F., & Bui, T. (2023). Empowering sentence encoders with prompting and label retrieval for zero-shot text classification. *arXiv preprint arXiv:2212.10391*. https://arxiv.org/abs/2212.10391

Winata, G. I., Cahyawijaya, S., Liu, Z., Lin, Z., Madotto, A., & Fung, P. (2021). Are multilingual models effective in code-switching? In *Proceedings of the Fifth Workshop on Computational Approaches to Linguistic Code-Switching* (pp. 142–153). Association for Computational Linguistics. https://aclanthology.org/2021.calcs-1.20

---

# Change log (delete before submission)

Every [PENDING] marker is resolved. "Verified" means checked against `origin/main` at `4fe30dcae`.

| Section | Was | Now | Source |
|---|---|---|---|
| 1.5 Scope | Gmail only | Gmail evaluated; Outlook enabled in production, not evaluated | production system test S1-02, SYS-D05 |
| 1.5 Scope | Categories not modifiable by users | Users can create, rename, re-describe and delete categories per mailbox; only the eight defaults were evaluated | `utils/actions/categoraize.ts`, schema |
| 1.5 Limitations | One second labeler | Two exercises: three team members and one additional labeler | `RESULTS.md`, `human_review.json`, `FILLED.csv` |
| 2.6, 3.5.4 | Per-user or sender-level centroids | Feedback updates per-mailbox, per-category centroids; the sender centroid table is separate | `categoraize-classification.ts`, schema |
| 2.7 | "Email body is not stored" | Stored encrypted: subject, snippet, latest reply up to 8,000 characters, summary, action text, span text | `ENCRYPTED_EMAIL_FIELDS`, schema |
| 3.1 | Pending items | Component tests, system tests and load test done; user study not done | `docs/testing/` |
| 3.2 | Redis 24 h TTL pending | Not implemented, not claimed (verified) | grep |
| 3.2 | Stores spans as offsets | Stores span text; encrypted; RLS role; deployment paragraph | schema, memory of deployment |
| 3.3.1 | 0.97 / 0.79 / 0.64, one labeler | Kept as Exercise B (recomputed from the stored sheet, matches) and added Exercise A, the team labels in `RESULTS.md` (0.805 / 0.753 / 0.457). They are different labelers, not a conflict | `RESULTS.md`, `human_review.json`, `FILLED.csv`, session record of the 2026-11-21 hand-off |
| 3.3.1 | Adjudication uncommitted | Committed in `c66c845e1` | git log |
| 3.4 | Truncation pending | No truncation in service; 8,000-character cap in web; encoder default 128 word pieces; 24-character word cap | schema, `config.json` |
| 3.5.2 | v6 numbers | Verified: 0.770 → 0.852 → 0.873; seed 13; 12 epochs | `metrics.json` |
| 3.7 | "Three revision rounds" pending | One committed version; not claimed | git log |
| 3.7 | Apple M2 pending | CPU; machine not recorded | `train_lib.py` |
| 3.8 | Tables 3.4 and 3.5, errors | Verified unchanged | `RESULTS.md` |
| 3.9.1 | Tests unconfirmed; 85% coverage | 312 cases, 305 pass, 7 expected failures; 95.0% and 93.2% line coverage | `component_tests.md` |
| 3.9.2 | Load and backup not performed | Load run (p95 6.6 s, target missed); restore passed in 149 s; 3-2-1 not met | `system_tests.md` |
| 3.10 | Targets only | Targets with measured status | `system_tests.md` |
| 3.11 | Consent and erasure unverified | Implemented; production end-to-end blocked on test accounts | `phase-10-report.md`, C12 |

**Decisions recorded:** Exercise A (team, three labelers, `RESULTS.md`) is the primary agreement result; Exercise B is supplementary until its labeler is confirmed. The native-speaker review is counted as done by the team (all three reviewers confirmed as native Filipino speakers), with the outside-the-team review listed as a limitation.

**Wording chosen where the repository is silent:** the Exercise B labeler is not named (the paper says only that the labeler received the blind sheet); the training machine is not named (CPU only). Add either if you want to.
