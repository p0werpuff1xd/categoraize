CategorAIze: An AI-Based Customizable Email Classification and Prioritization System 

Group: Gutierrez, Kristine Ianne Marie P. · Quidit, Lauren Jade P. · Santos, Andjhelyn Denielle E. De La Salle University – Dasmariñas




Chapter 1 Introduction

1.1 Project Context

Email is one of the primary channels of professional communication in the Philippines and across the world. As of 2025, Filipino internet users access email at rates placing the Philippines among the most digitally active nations in Southeast Asia (DataReportal, 2025). The growth in email volume has made the inbox a source of cognitive burden for professionals, and the problem is sharpened by the multilingual nature of Filipino professional communication — a fluid mixture of English, Filipino (Tagalog), and mixed-code Tagalog-English commonly called Taglish. No mainstream email management tool is designed for this register, and no existing tool extracts task and deadline information from email bodies as structured data.

CategorAIze is a fork of the open-source email management platform Inbox Zero (elie222/inbox-zero), extended with a custom multilingual natural language processing pipeline. The system automatically assigns each incoming email to one of eight fixed semantic categories, extracts TASK and DATE spans as structured data, computes a calendar-conflict flag, assigns a priority score, and adapts its categorization to each user's email vocabulary through a relevance feedback mechanism.

The processing of email content — which constitutes personal and in many cases sensitive communication data — raises significant information security and data privacy obligations. Email bodies may contain names, government identification numbers, payment details, medical information, and confidential business correspondence. Any system that reads, analyzes, and stores email content on behalf of users is a personal information processor under Philippine law, and must demonstrate that it handles that data lawfully, securely, and with minimal risk to data subjects.

CategorAIze was designed with these obligations as first-class constraints. The information assurance and security architecture of the system — its legal basis, threat model, technical controls, and compliance verification — is the subject of this paper.

1.2 Statement of the Problem

The deployment of an AI-powered email processing system raises three distinct security and privacy problems that existing email clients do not address.

First, existing email management systems that apply machine learning to email content do not give users meaningful control over how their data is used. Gmail's categorization system is a black-box model; users cannot inspect what data was used to train it, cannot correct it, and cannot request erasure of their data from its training corpus. Under RA 10173, Filipino data subjects have the right to access, correct, and erase their personal information. An email processing system that cannot support these rights cannot lawfully operate in the Philippines.

Second, storing email content in a third-party database beyond the user's own mailbox provider introduces new attack surfaces. If the stored email content is not encrypted, a database breach exposes the full text of personal communications. If access control is not enforced at the database row level, a software bug or compromised session token could allow one user's data to be accessed by another. Neither risk is adequately addressed by simply inheriting the upstream Inbox Zero codebase without modification.

Third, the use of an external AI service for email analysis — which is a feature of many email productivity tools — introduces the risk that email content is transmitted to and potentially retained by a third-party AI provider without the user's informed consent. Google's API Services User Data Policy explicitly prohibits using Gmail data to train shared models or for purposes beyond serving the authenticated user (Google, 2024). An email application that sends email bodies to an external language model without user consent violates both the Google API policy and the purpose limitation principle of RA 10173.

CategorAIze addresses these three problems through a combination of legal compliance measures, technical controls, and user-facing transparency mechanisms.

1.3 Objectives of the Study

General Objective

The general objective of this study is to design, implement, and validate the information assurance and security architecture of CategorAIze, a multilingual AI-powered email management system, in compliance with Republic Act No. 10173 (Data Privacy Act of the Philippines) and the Google API Services User Data Policy.

Specific Objectives

To implement application-layer AES-256-GCM encryption for all sensitive email text fields stored by CategorAIze, and to verify through a production database audit that no plaintext email content is stored in the encrypted columns.

To implement and enforce Supabase row-level security (RLS) policies on all CategorAIze-added database tables, restricting each authenticated user's data access to their own rows through a runtime database role that has no bypass privilege.

To implement PII masking in the Next.js application layer before email content is transmitted to the NLP service, replacing Philippine mobile numbers, government ID numbers, and payment card numbers with safe placeholder tokens.

To implement a user consent mechanism, export function, and erasure function that satisfy the data subject rights enumerated in RA 10173 — specifically the rights of access, correction, and erasure — and to gate all external AI processing behind a separate opt-in consent.

To implement and test a 3-2-1 encrypted backup strategy for the application database, documenting achieved Recovery Point Objective (RPO) and Recovery Time Objective (RTO) against targets.

To verify Google API Limited Use compliance by confirming that the NLP service processes no real Gmail data for model training, that all training data is fictional, and that the consent screen is displayed before Gmail data is processed.

1.4 Significance of the Study

Filipino email users benefit directly from the privacy protections embedded in CategorAIze. By encrypting stored email content, enforcing row-level access control, and giving users the ability to export or erase their data, the system respects the rights of data subjects under Philippine law in a domain — AI-powered email management — where such protections are rarely implemented or documented.

Data privacy practitioners and legal researchers benefit from the study's application of RA 10173 compliance principles to an AI-powered email system. CategorAIze provides a documented reference implementation of privacy-by-design in the Philippine regulatory context, including a threat model, a compliance checklist, and evidence of tested controls — a combination that is rarely available for academic or practitioner reference.

The National Privacy Commission and future researchers studying AI governance in the Philippines benefit from a case study that demonstrates how the NPC's 2023 AI guidelines (National Privacy Commission, 2023) can be implemented in a production system with specific, verifiable controls, rather than treated as aspirational principles.

The software engineering research community benefits from the demonstration that a fork-based development strategy applied to a production-grade open-source platform can produce a research-quality system with well-defined security controls, without requiring a greenfield implementation that duplicates infrastructure already solved by the upstream project.

1.5 Scope and Limitations

Scope

The IAS scope of this study covers the following. The system processes email from mailboxes connected via OAuth 2.0; evaluation used Gmail, and the Outlook connection is enabled in production but was not evaluated for the security controls documented here. All email text processed by CategorAIze is handled exclusively within the user's authenticated session and is stored only in the user's Supabase database row, encrypted at the application layer. The NLP service is stateless and retains no email content between requests. The backup and recovery controls apply to the local Supabase database; the Supabase-hosted production backup was not tested in this study. The OAuth consent screen is implemented and verified on a development build; the production end-to-end check is blocked pending test accounts.

Limitations

The study acknowledges the following limitations. The end-to-end production verification of the consent screen, erasure flow, and export flow is blocked until dedicated test accounts are created. The 3-2-1 backup rule is not fully met: both copies are local and there is no off-site copy, which means the RPO target cannot be met if the local storage is destroyed. The security audit was performed read-only against the production database; it was not a penetration test. Known defects include publicly accessible NLP API documentation pages (SYS-D02, Medium severity), a web Content-Security-Policy that permits unsafe-inline and unsafe-eval (SYS-D08, Low severity), and the presence of an X-Powered-By header (SYS-D03, Low severity). These are logged as open defects and are not remediated in the current deployed version.

1.6 Definition of Terms

Republic Act No. 10173 (RA 10173) is the Data Privacy Act of the Philippines (2012), the primary legal framework governing the collection, storage, and processing of personal information in the Philippines. It establishes the rights of data subjects — including the rights of access, correction, and erasure — and the obligations of personal information controllers and processors.

Personal information controller (PIC) refers, under RA 10173, to any person or organization that controls the collection, holding, processing, or use of personal information. CategorAIze's operators are the personal information controller with respect to the email data processed through the system.

Personal information processor (PIP) refers, under RA 10173, to any person or organization that processes personal information on behalf of a personal information controller. The CategorAIze system itself, as a software platform processing email content, acts as a personal information processor on behalf of the user.

AES-256-GCM (Advanced Encryption Standard, 256-bit key, Galois/Counter Mode) is a symmetric authenticated encryption algorithm. It provides both confidentiality (the ciphertext reveals nothing about the plaintext without the key) and integrity (any modification of the ciphertext is detected via the authentication tag). It is used in CategorAIze for application-layer encryption of stored email text fields.

Row-level security (RLS) is a database access control mechanism that restricts which rows a given authenticated user can read or write, based on the user's identity and a set of policy rules enforced by the database engine. In CategorAIze, RLS is enforced at the Supabase Postgres layer through a runtime database role that has no bypass privilege.

PII masking refers to the replacement of personally identifiable information with neutral placeholder tokens before that text is processed by or transmitted to a downstream system. In CategorAIze, the Next.js application replaces Philippine mobile numbers with [PHONE], government ID numbers with [GOV_ID], and payment card numbers with [CARD] before sending text to the NLP service.

OAuth 2.0 is an authorization framework that allows a user to grant an application limited access to their account at a third-party service (such as Gmail) without exposing their credentials. CategorAIze uses OAuth 2.0 for mailbox connection and requests only the minimum scopes required.

HKDF-SHA256 (HMAC-based Key Derivation Function using SHA-256) is a key derivation function used in CategorAIze to derive per-column encryption keys from a master key, with a unique salt and info string per column. This ensures that a compromise of one column's ciphertext does not directly expose the keys for other columns.




Chapter 2 Review of Related Literature and Studies

2.1 Data Privacy Law in the Philippines and AI Systems

Republic Act No. 10173, the Data Privacy Act of the Philippines, was enacted in 2012 and remains the primary legal framework governing the processing of personal information in the Philippine context (Republic Act No. 10173, 2012). The Act establishes three core principles — transparency, legitimate purpose, and proportionality — that apply to all personal information controllers and processors, including software systems that process personal communication data on behalf of users. Transparency requires that data subjects be informed of the collection and processing of their data before it occurs. Legitimate purpose requires that data be collected only for a stated, lawful purpose and not used beyond it. Proportionality requires that only the data necessary for the stated purpose be collected and retained.

RA 10173 enumerates specific rights of data subjects, of which three are most directly relevant to an email processing system: the right of access (a data subject may request a copy of all personal information held about them), the right to correction (a data subject may request correction of inaccurate or incomplete records), and the right to erasure or blocking (a data subject may request deletion of their personal information when it is no longer necessary for the purpose for which it was collected). These rights impose corresponding obligations on the information controller: the system must be capable of producing a complete export of a user's data and of irreversibly deleting it on request.

The National Privacy Commission of the Philippines issued guidelines in 2023 specifically addressing AI systems that process personal data, affirming that AI-powered tools must comply with the same data minimization, purpose limitation, and consent requirements as conventional data processing systems (National Privacy Commission, 2023). The 2023 guidelines further require that AI systems be explainable to data subjects — that users be able to understand why a decision was made about their data — and that they include human oversight mechanisms. For CategorAIze, the category correction and manual override features satisfy the explainability and human oversight requirements: a user can inspect why an email was assigned to a category, correct the assignment, and override any AI decision.

2.2 Encryption Standards for Personal Data at Rest

Application-layer encryption is a recognized best practice for protecting personal data stored in cloud database services, where the cloud provider's staff and infrastructure may otherwise have access to plaintext data. The National Institute of Standards and Technology (NIST) recommends AES with a 256-bit key as the standard for symmetric encryption of sensitive data at rest, and GCM mode as the preferred authenticated encryption mode because it provides both confidentiality and integrity without requiring a separate MAC computation (NIST, 2001).

The key management practices associated with AES-256-GCM have been studied extensively in the applied cryptography literature. Per-column key derivation using HKDF (Krawczyk & Eronen, 2010) reduces the blast radius of a key compromise: if an attacker obtains the ciphertext and the derived key for one column, they cannot decrypt another column's ciphertext without also obtaining that column's derived key. The use of a random 12-byte initialization vector (IV) per encryption operation, as specified by NIST for GCM, ensures that encrypting the same plaintext twice produces different ciphertexts, preventing frequency analysis attacks on stored records. The 16-byte GCM authentication tag ensures that any modification of the ciphertext — whether by an attacker or by data corruption — is detected with overwhelming probability before decryption is attempted.

2.3 Database Row-Level Security and Multi-Tenant Isolation

Multi-tenant web applications — applications where multiple users store data in a shared database — must enforce isolation between tenants so that one user cannot access another user's records. The two principal approaches to multi-tenant isolation are application-layer filtering (the application adds a WHERE user_id = current_user clause to every query) and database-layer row-level security (the database enforces access policies that the application cannot bypass).

Application-layer filtering is fragile: a single missing WHERE clause in any query path exposes all records to the authenticated user. Database-layer RLS is more robust because the enforcement is in the database engine, not the application code, and applies even if the application contains a bug that omits the filter. Postgres RLS, which is the mechanism available through Supabase, allows policies to be defined per table that restrict SELECT, INSERT, UPDATE, and DELETE operations based on the current session's authenticated user identity (Momjian, 2001). When RLS is enabled on a table, every query against that table is implicitly filtered by the applicable policy, regardless of which application or user sends the query.

A critical detail for Postgres RLS is the database role used at runtime. Roles with the BYPASSRLS privilege bypass all row-level security policies, as do superuser roles. An application that connects to the database using a superuser or BYPASSRLS role receives no protection from RLS, even if policies are defined. Secure deployment therefore requires that the application connect through a role that has no BYPASSRLS privilege, so that RLS is enforced on every query (PostgreSQL Global Development Group, 2024).

2.4 OAuth 2.0 and Principle of Least Privilege

OAuth 2.0 is an authorization framework that allows a user to delegate limited access to their account at a resource server (such as Gmail) to a client application, without disclosing their credentials to the client (Hardt, 2012). The access token issued by the authorization server encodes the granted scopes, and the resource server enforces that the token's scopes authorize each requested operation.

The principle of least privilege, applied to OAuth scopes, requires that an application request only the scopes it actually needs and not broader scopes that would simplify implementation at the cost of unnecessary access (Saltzer & Schroeder, 1975). For a Gmail-reading application, the least-privilege scope is typically gmail.readonly or gmail.modify (depending on whether the application writes to the mailbox), not the broader mail.google.com scope that grants full mailbox access including the ability to permanently delete messages. Requesting excess scopes is a security risk — if the application's OAuth token is stolen, an attacker can perform any operation permitted by the token's scopes — and may violate Google's OAuth API policies, which require that applications request only the scopes necessary for stated functionality.

2.5 PII Masking in NLP Pipelines

Natural language processing pipelines that process user-generated text frequently encounter personally identifiable information — names, phone numbers, identity document numbers, financial account numbers, email addresses — embedded in the input text. When this text is transmitted to a downstream service (such as a machine learning inference API), any PII in the text is exposed to that service. Even if the downstream service does not retain the text, the transmission itself constitutes a disclosure of personal information to a third party.

PII masking, also called PII redaction or anonymization, is the practice of replacing PII with neutral placeholder tokens before the text is processed or transmitted downstream. Masking is distinct from pseudonymization: a pseudonymized record replaces the PII with a consistent placeholder that could be re-identified if the mapping is compromised, whereas masking replaces the PII with a category token (such as [PHONE]) that reveals the type of the PII but not its value and cannot be reversed.

The limitation of rule-based PII masking is that it is bounded by the coverage of its rules. A masker that recognizes Philippine mobile numbers (which begin with 09 or +63 9 and have 11 digits) will not recognize foreign phone numbers or numbers written in non-standard formats. Regular-expression-based masking of government ID numbers is similarly dependent on the formats that the patterns cover. For CategorAIze, the masking rules are designed for the most commonly occurring PII types in Filipino professional email: mobile numbers, SSS/PhilHealth/TIN numbers, and payment card numbers. Email addresses are present in every email header and are not masked by the current implementation, because they are already exposed to the application through the Gmail API and masking them would prevent the application from functioning.

2.6 Backup and Recovery in Cloud-Deployed Systems

The 3-2-1 backup rule is a widely adopted guideline for data backup strategy: maintain at least three copies of the data, on at least two different storage media, with at least one copy stored off-site (Zetter, 2008). The rationale for each component is distinct. Three copies ensures that two simultaneous failures — which are unlikely but not negligible over long time horizons — do not result in total data loss. Two media types protects against media-specific failure modes (a single storage array failure, for example). One off-site copy protects against site-level disasters — fire, flood, or theft — that would destroy all copies at a single location simultaneously.

For cloud-deployed systems, the 3-2-1 rule must be interpreted carefully. Many cloud database services (including Supabase) provide automated backups, but these backups are stored in the same cloud region and sometimes in the same storage account as the primary data. If the cloud provider suffers a region-level outage or the account is compromised, both the primary data and the backup may be inaccessible simultaneously. True 3-2-1 compliance for a cloud-deployed system therefore requires exporting at least one backup copy to a storage location outside the cloud provider — a different cloud provider, a different account, or on-premises storage (Backblaze, 2023).

The Recovery Point Objective (RPO) and Recovery Time Objective (RTO) are the two principal metrics for backup and recovery adequacy. RPO is the maximum amount of data loss, measured in time, that is acceptable in a disaster scenario — that is, how old the most recent backup can be when it is restored. RTO is the maximum amount of time that the system can be unavailable while recovery is in progress. For CategorAIze, the RPO target is 24 hours (meaning that in the worst case, one day of email processing history may be lost) and the RTO target is 4 hours (meaning that the system should be restored to operation within four hours of a disaster). Both targets reflect the academic and professional context of the application: loss of one day's email categorization history is recoverable, and four hours of downtime is acceptable.

2.7 Google API Limited Use and Third-Party AI

Google's API Services User Data Policy (Google, 2024) imposes specific obligations on applications that access Gmail data via the Gmail API. The Limited Use requirements prohibit using Gmail data for purposes beyond providing the service to the authenticated user, sharing Gmail data with third parties except as necessary to provide the service, or training AI models that are shared across users using Gmail data. These requirements are legally binding on applications that use the Gmail API and are enforced through Google's OAuth verification process.

The prohibition on using Gmail data for shared model training is directly relevant to email AI applications that fine-tune language models on user email. CategorAIze avoids this category of risk entirely: the NLP models in the system (the SBERT categorizer, the Bi-LSTM-CRF tagger, and the priority logistic regression model) are trained exclusively on fictional synthetic data. The team annotated a corpus of 430 fictional emails used for evaluation and to train the priority and register models; the tagger training corpus additionally comprises 5,000 template-generated synthetic emails and additional LLM-generated examples. No real Gmail content was used at any stage of model development.

The prohibition on sharing Gmail data with third parties creates a constraint on the use of external AI services (such as OpenRouter-hosted language models) for email processing. When CategorAIze's drafting and filing features call an external language model, they do so only after the user has provided explicit opt-in consent for that specific use. This consent is separate from the general Terms and Privacy consent collected at first login, is off by default, and can be withdrawn at any time.

2.8 Synthesis

The literature reviewed in this chapter establishes the legal, technical, and policy framework within which CategorAIze's information assurance and security architecture must operate.

RA 10173 (Section 2.1) establishes the rights of data subjects — access, correction, erasure — and the obligations of information controllers, including transparency, purpose limitation, and proportionality. These obligations are not aspirational: they are legally enforceable, and CategorAIze must demonstrate specific implemented controls for each.

Encryption standards (Section 2.2) establish AES-256-GCM as the appropriate mechanism for protecting stored email text, with per-column key derivation via HKDF, random IVs per operation, and GCM authentication tags for integrity verification. These are not arbitrary design choices; they represent the current state of practice for application-layer encryption of sensitive personal data.

Row-level security (Section 2.3) establishes database-layer access control as the appropriate mechanism for multi-tenant isolation, and identifies the critical detail that the runtime database role must not have BYPASSRLS privilege. Application-layer filtering alone is insufficient.

Least-privilege OAuth scopes (Section 2.4) establish that the application should request only the Gmail scopes actually needed, minimizing the attack surface if an OAuth token is stolen or misused.

PII masking (Section 2.5) establishes the rationale and limitations of rule-based masking before NLP processing — it reduces but does not eliminate PII exposure in downstream services, and must be designed for the specific PII types likely to appear in Filipino professional email.

Backup and recovery (Section 2.6) establishes the 3-2-1 rule, RPO and RTO as the standard framework for evaluating data recovery adequacy, and identifies the cloud-specific limitation that provider backups alone do not constitute 3-2-1 compliance.

Google Limited Use (Section 2.7) establishes the contractual and policy constraints on Gmail data use, specifically the prohibition on shared model training and the requirement for explicit consent before third-party AI processing.

The gap that CategorAIze's IAS architecture addresses is the absence of a documented, tested, and verified set of information security and privacy controls in prior work on AI-powered email management systems for the Filipino context. CategorAIze is designed to fill this gap by implementing each of the controls above, verifying them through production testing, and disclosing their status honestly — including where controls are implemented but not yet fully verified, and where known limitations remain.




Chapter 3 Research Methodology — Information Assurance and Security

3.1 Research Design

This study adopts a constructive research design. The artifact is CategorAIze's information assurance and security architecture — a set of technical controls, legal compliance measures, and operational procedures designed to protect the personal data of CategorAIze's users and ensure compliance with RA 10173 and Google's API policies. The architecture is evaluated through implementation verification, production database audits, and a system test campaign that includes specific security and privacy test cases.

The research proceeds in three phases, mirroring the overall system development.

Phase 1: Threat modeling and control design. The researchers identified the assets to protect (email content, OAuth tokens, user corrections and feedback, embeddings), the threat actors (unauthenticated external attackers, authenticated users attempting cross-user data access, the NLP service as a potential data sink, and the development team as an insider threat), and the attack vectors relevant to each asset. From this threat model, the required controls were specified: application-layer encryption, row-level security, PII masking, consent and erasure endpoints, internal API authentication, and backup with restore verification.

Phase 2: Control implementation. Each control was implemented in the codebase. Encryption was implemented in the Next.js application layer, applied before database writes and reversed after database reads, so that the Supabase service never holds plaintext in the encrypted columns. Row-level security was implemented through Supabase policy definitions and a runtime role without bypass privilege. PII masking was implemented in both TypeScript and Python with shared test vectors to ensure consistency. The consent screen, export endpoint, and erasure endpoint were implemented in the Next.js application. The internal API key mechanism was implemented in the FastAPI NLP service, which rejects requests without a valid key with HTTP 401 and fails closed when no key is configured.

Phase 3: Verification. The implemented controls were verified through the system test campaign (Section 3.9) and a read-only production database audit. Verification evidence is documented in docs/testing/system_tests.md.

3.2 Threat Model

Assets. The assets protected by CategorAIze's security architecture are: (1) email content — subject lines, body text, and extracted spans stored in the database; (2) OAuth access and refresh tokens, which grant access to the user's Gmail or Outlook mailbox; (3) user corrections and feedback (category assignments, priority overrides, and confirmed clusters), which reveal the user's email behavior and priorities; (4) embedding vectors, which encode the semantic content of the user's email without storing the plaintext; and (5) the internal API key, which authenticates the Next.js application to the NLP service.

Threat actors. Four threat actor categories are considered.

External attackers without authentication may attempt to access the application's HTTP endpoints, including the NLP service, to extract data or cause denial of service. Mitigations: the NLP service is not exposed to browsers (no CORS headers); all endpoints require a valid internal API key; the web application requires an authenticated session for all data-accessing routes.

Authenticated users attempting cross-user access may attempt to access another user's email data or embeddings by manipulating query parameters or exploiting application bugs. Mitigation: Supabase RLS enforced at the database layer, so even a buggy application query cannot return another user's rows; the runtime role has no bypass privilege.

The NLP service as a data sink. Because the NLP service receives email content (after PII masking), a compromised or misconfigured NLP service could log or retain that content. Mitigations: the NLP service is designed to be stateless; a three-day scan of production logs (20,000 entries) confirmed that no email content, tokens, keys, or database URLs appear in the logs; the NLP service has no database connection of its own.

Insider threat and accidental exposure. Development team members with access to the repository or the production database could inadvertently expose data through misconfiguration or logging. Mitigations: encryption at the application layer means that database administrators see only ciphertext; the master key is held outside the repository; the secrets scanner was run and triaged; OAuth tokens are encrypted before storage.

Attack vectors. The attack vectors considered include: SQL injection through the web application; session token theft (allowing cross-user access if RLS were not enforced); OAuth token theft (allowing access to the user's Gmail mailbox); NLP service misconfiguration (logging email content); backup file interception (exposing all stored data); and social engineering of the development team (leading to insecure configuration).

3.3 Legal Compliance Framework

3.3.1 RA 10173 Compliance

CategorAIze's compliance with RA 10173 is organized around the Act's three principles and three data subject rights most relevant to the system.

Transparency. The system presents users with an informed consent screen at first login, before any email content is processed. The consent screen discloses: (a) what personal information is collected (email subject, body text, sender information, extracted spans, and embeddings); (b) the purpose for which it is processed (email categorization, task extraction, and calendar-conflict detection); (c) how long it is retained (until the user erases their account); and (d) the user's right to withdraw consent and erase their data. Users who decline consent retain access to the application's email-reading and calendar features; only the AI processing features are disabled for non-consenting users.

Legitimate purpose and proportionality. Email content is processed exclusively for the purpose of providing the categorization, task extraction, and calendar-conflict features to the authenticated user. The system stores the subject, snippet, latest reply text (up to 8,000 characters), summary, extracted action text, and span text — the minimum text necessary to populate the user's inbox view and support re-scoring after a category centroid update. The full email body beyond 8,000 characters is not stored. Attachment content is not stored. The NLP service processes the masked text at inference time and does not retain it.

Data subject rights. Three rights are implemented:

Right of access: users can request an export of all their data through the export endpoint, which produces a JSON file containing all rows in the user's tables (email metadata, embeddings, corrections, and category definitions). The export is generated on demand and delivered to the authenticated user.

Right to correction: users can correct the category and priority of any email through the application interface. Corrections update the centroid for the corrected category and can trigger re-scoring of stored emails.

Right to erasure: users can request account deletion through the erasure endpoint, which deletes all rows associated with the user from the database tables (email records, embeddings, corrections, category definitions), deletes Redis keys associated with the user, and revokes the user's Google OAuth access token. After a restore from backup, erasures are re-applied from an erasure log to ensure that deleted data is not restored.

3.3.2 Google API Limited Use Compliance

CategorAIze's compliance with Google's Limited Use requirements is verified through four measures.

Training data isolation. No real Gmail content was used for model training. The SBERT categorizer requires no training data (zero-shot). The Bi-LSTM-CRF tagger was trained on 5,000 synthetic emails generated by the team's template generator, team-written examples, and LLM-generated examples — all fictional. The priority and register models were trained on the same 300-email fictional training split drawn from a team-annotated corpus of 430 emails. The full 430-email annotated corpus was used for evaluation (Section 3.9); the tagger training data, which is template-generated and larger, is a separate set. A text-match check confirms that the frozen 100-email test split does not appear in any training file.

Consent gate. A consent screen is displayed at first login and is mandatory before any email content is processed. The consent screen discloses the Limited Use terms: Gmail data is used to provide the categorization service to the authenticated user and is not used for any other purpose.

External AI consent. The drafting, filing, and Reply Zero features, which call an external language model through OpenRouter, are gated behind a separate opt-in consent that is off by default. Users who have not opted in do not have their email content transmitted to OpenRouter.

Log audit. A three-day scan of 20,000 production log entries confirmed that no email content, OAuth tokens, database URLs, or API keys appear in the NLP service logs. Only request identifiers and counts are logged.

3.4 Technical Controls

3.4.1 Application-Layer Encryption

Stored email text fields are encrypted at the application layer with AES-256-GCM before they are written to the Supabase database, and decrypted after they are read back. The encrypted fields are: subject, snippet, latest-reply text (up to 8,000 characters), summary, extracted action text, and span text for each extracted span. The sender address, user identifiers, and embedding vectors are not encrypted, because lookups and cosine similarity search require them in plaintext.

Key management. A master encryption key is held outside the repository in an environment variable. Per-column keys are derived from the master key using HKDF-SHA256, with a unique salt and info string per column, identified by key identifier p1. This derivation ensures that the key used to encrypt the subject column is different from the key used to encrypt the body column, limiting the blast radius of a key exposure. Each encryption operation generates a fresh random 12-byte IV, so encrypting the same plaintext twice produces different ciphertexts.

Verification. A read-only audit of the production database found 826 encrypted values and no plaintext in the encrypted columns. Every stored OAuth access and refresh token was also encrypted.

3.4.2 Row-Level Security

Supabase row-level security is enabled on all 13 new database tables added for CategorAIze. The policies are structured in two groups: eleven tables are protected by per-email-account policies, restricting SELECT, INSERT, UPDATE, and DELETE operations to rows whose `emailAccountId` matches the authenticated user's connected mailbox; the consent and user-settings tables are protected by per-user policies keyed on `userId`. The application connects to the database through a runtime role (categoraize_app) that has no BYPASSRLS privilege, ensuring that the policies are enforced on every query regardless of which code path sends it.

Verification. The system test campaign verified that RLS is enforced on all new tables by confirming the presence of the appropriate policies and verifying that the runtime role has no bypass privilege. Cross-user access attempts (authenticated as User A and querying for User B's rows) were not performed as explicit penetration test cases; this remains an open gap.

3.4.3 PII Masking

Before email text is transmitted to the NLP service, the Next.js application applies PII masking rules to the subject and body text. The rules replace:

* Philippine mobile numbers (starting with 09 or +63 9, 11 digits) with [PHONE]
* SSS, PhilHealth, and TIN numbers (matching their respective formats) with [GOV_ID]
* Payment card numbers that pass the Luhn check with [CARD]


Dates, amounts, order numbers, and email addresses are not masked. Only counts of masked items are retained in the application logs; the original values are not logged.

Consistency verification. The PII masking rules are implemented in both TypeScript (for the Next.js application) and Python (for a testing harness), and are tested against a shared set of test vectors so that both implementations produce identical output. This prevents divergence between the production masking behavior and the test-verified behavior.

3.4.4 Internal API Authentication

The NLP service is not accessible to browsers or external clients. All requests to the NLP service must include an X-Internal-Key header containing a valid API key. The service rejects requests without a valid key with HTTP 401. Failed authentication attempts are counted and logged (without logging the presented key). The service fails closed when no key is configured: if the environment variable for the internal key is absent, the service starts but rejects all requests.

No CORS middleware is installed on the NLP service, so browsers cannot call it directly even if they obtain the internal key from a network intercept.

Verification. The system test campaign verified that all 11 NLP endpoints reject a missing or invalid key with HTTP 401.

3.4.5 OAuth Scope Minimization

CategorAIze requests only the Gmail and Google Calendar OAuth scopes required for its declared functionality. The granted scopes match the least-privilege list verified in the system test campaign. No unused scopes are requested.

3.5 Data Flow with Privacy Annotations

The request flow for email processing is as follows, with privacy controls annotated at each step.

Step 1: Mailbox notification. Gmail sends a push notification to the Next.js application when a new message arrives. No email content is transmitted in this notification — only the message ID and mailbox identifier.

Step 2: Message fetch. The application fetches the message using the Gmail API, authenticated with the user's OAuth token. The token is decrypted from the database just before use and is not held in memory beyond the fetch operation.

Step 3: PII masking. The application applies the masking rules to the subject and body text. Counts of masked items are logged; original values are not.

Step 4: NLP service call. The masked subject and body are transmitted to the NLP service over an internal HTTPS connection authenticated with the internal API key. The NLP service processes the text and returns the category, spans, priority, register, and calendar-conflict flag. The service writes nothing to disk or database; logs record identifiers and counts only.

Step 5: Encryption and storage. The application encrypts the subject, snippet, body text, summary, action text, and span text using AES-256-GCM before writing them to the database. Embedding vectors, sender identifiers, and category assignments are stored in plaintext because they are needed for similarity search and display queries.

Step 6: Inbox rendering. The application queries the database for the user's email records. RLS ensures that only the authenticated user's rows are returned. Encrypted fields are decrypted in the application layer before rendering.

3.6 Consent, Export, and Erasure

3.6.1 Consent

The consent screen is displayed at first login, before any email content is fetched or processed. It presents the Terms of Service and Privacy Policy and requires explicit acceptance before the inbox is populated. Users who do not accept are redirected to a reduced-functionality view. A consent event is recorded in the security log with a timestamp and the user identifier.

Withdrawal of consent triggers account deletion: the user is redirected to the erasure flow, which removes all stored data and revokes the OAuth token.

The consent screen was verified on a development build. The production end-to-end verification is blocked pending test accounts.

3.6.2 Export

The export endpoint produces a JSON file containing all rows in the user's tables: email records (excluding the raw body beyond the stored 8,000-character excerpt), span records, correction records, category definitions, and centroid vectors. The file is delivered to the authenticated user over HTTPS and is not stored on the server after delivery.

3.6.3 Erasure

The erasure endpoint, triggered by account deletion, performs the following operations in order: deletes all email records, span records, correction records, and centroid vectors associated with the user from the database; deletes Redis keys associated with the user's session and queue; revokes the user's Google OAuth access token; and records the erasure in an erasure log. After a restore from a backup that predates the erasure, the erasure log is replayed to re-apply deletions, ensuring that restored data does not include records for users who have requested erasure.

3.7 Backup and Recovery

3.7.1 Strategy

CategorAIze's backup strategy is a 3-2-1 target: three copies of the database, on two different storage media, with one off-site copy. The current implementation meets two of the three criteria: an encrypted backup of the local database is produced on a daily schedule and stored locally alongside the primary database. A second local copy satisfies the "two different media" criterion only if the backup is stored on a physically separate disk from the primary. The third criterion — an off-site copy — is not currently met. This is documented as defect SYS-D07 and is an acknowledged gap.

Encryption. The backup file is encrypted before storage. The encryption protects against unauthorized access to the backup file if the storage medium is physically stolen or accessed by an unauthorized party.

3.7.2 Recovery Point Objective

The daily backup schedule gives a worst-case RPO of 24 hours: in the event of a database failure, up to one day of email processing history may be lost. This meets the stated RPO target of 24 hours for the local database. It does not meet the target for a site-level disaster, because the backup is local.

3.7.3 Recovery Time Objective

A restore drill was performed by restoring the encrypted backup into a scratch database. The data restore completed in 113 to 115 seconds over two measured runs, with matching row counts, a verified checksum, and a tampered backup file correctly refused. This result demonstrates that the RTO target of 4 hours can be met for the local backup restore scenario. The full-service RTO — including secrets recovery, application startup, and mailbox reconnection — was not drilled end-to-end. Restoring a Supabase production backup (which uses a different backup mechanism) was not tested in this study.

3.8 Known Security Defects

The system test campaign identified five open defects that were not remediated in the current deployed version.

SYS-D02 (Medium): NLP API documentation pages are publicly accessible. The FastAPI service serves its auto-generated OpenAPI documentation (at /docs and /redoc) without authentication. While these pages expose no user data, they disclose the service's API structure to unauthenticated clients. Remediation: disable documentation endpoints in the production deployment configuration.

SYS-D06 (Medium): NLP service response time under load exceeds the target. Under 50 concurrent users with 1–3 second think time, the p95 response time is 6.6 seconds against a 2-second target; p99 reaches 63 seconds. Throughput is capped at 8.7 requests per second with a 0% error rate. Remediation: increase Cloud Run maximum instances (currently 2) and/or allocated CPU; consider a concurrency of 1 per instance for CPU-bound inference.

SYS-D07 (Medium): The 3-2-1 backup rule is not fully met. Both backup copies are stored locally; there is no off-site copy, and Copy 1 shares a disk with the live data. This is documented separately in Section 3.7.1. Remediation: direct one copy to a cloud-synced folder or an external drive kept off-site.

SYS-D03 (Low): X-Powered-By header is transmitted. The web application sends an X-Powered-By: Next.js header in HTTP responses, which discloses the web framework in use. Remediation: add a custom header to suppress this.

SYS-D08 (Low): Content-Security-Policy permits unsafe-inline and unsafe-eval. The web application's CSP header allows JavaScript from inline script tags and from eval(), which weakens cross-site scripting (XSS) protections. Remediation: refactor inline scripts and remove unsafe-eval, then tighten the CSP.

SYS-D04 (Low): Leftover link to upstream documentation. The 404 not-found page retains a link to the Inbox Zero upstream project's documentation. This is an informational disclosure but not a security vulnerability.

3.9 Testing and Verification

3.9.1 Component Tests — Information Assurance Cases

The component test campaign includes 44 information-assurance test cases covering row-level security (confirmed per-table, per-operation), data export (complete coverage of user tables), erasure (database rows, Redis keys, Google token revocation, erasure log, and post-restore re-application), and backup and restore (encrypted backup produced, restore validated with checksum, tampered file refused).

Of the 312 component test cases overall, 305 pass and 7 are expected failures tied to open defects. None of the 7 expected failures are in the information-assurance category.

3.9.2 System Test Campaign — Security Cases

The system test campaign was run against the production deployment. The security-relevant results are as follows.

API key enforcement. All 11 NLP service endpoints were tested with a missing key and with an invalid key. All 11 rejected both with HTTP 401.

OAuth scope verification. The granted scopes for a completed OAuth flow were compared against the declared least-privilege list. They matched.

Field encryption verification (read-only). The production database was queried read-only for the encrypted columns. 826 encrypted values were found and no plaintext was found in the encrypted columns. All stored OAuth tokens were encrypted.

RLS verification (read-only). RLS policies were confirmed as present on all new tables. The runtime role was confirmed to have no bypass privilege.

Log audit. A three-day scan of 20,000 production log entries found no email content, OAuth tokens, database URLs, or API keys.

Secrets scan. The pip-audit and pnpm audit dependency scans, and a secrets scanner against the repository, were run and triaged.

3.9.3 Blocked Tests

39 system test steps are blocked pending dedicated test accounts. The blocked security-relevant steps include end-to-end production verification of the consent screen, end-to-end production verification of the export and erasure flows, cross-user isolation testing (authenticated as one user attempting to access another user's data through the production application), and injection testing (SQL injection and XSS probes through the production interface). The report's own verdict is no-go until these steps are run.

3.10 Ethical Considerations

The dataset used for model training and evaluation is entirely fictional. No real email content was collected or used at any stage of model development. The planned user testing study (eight participants, System Usability Scale and Single Ease Question) requires ethics review before data collection begins; that review has not been completed.

The system's privacy-by-design principles — data minimization, purpose limitation, encryption at rest, and user control over erasure — are themselves ethical choices, not merely regulatory compliance measures. The decision to store only the minimum text necessary for the inbox view, to gate external AI processing behind explicit consent, and to implement erasure as a first-class feature rather than an afterthought reflects a commitment to treating email data as personal and sensitive by default, regardless of whether a specific regulatory requirement mandates each measure.

3.11 Limitations

The following limitations are acknowledged.

Incomplete 3-2-1 backup compliance. Both backup copies are local. A site-level disaster would destroy both copies simultaneously. This gap is documented as defect SYS-D07 (Medium) and was not remediated in the current deployment.

NLP service performance under load. Under 50 concurrent users, the NLP service p95 response time is 6.6 seconds against a 2-second target. This is documented as defect SYS-D06 (Medium) and was not remediated in the current deployment.

Blocked end-to-end production verification. The consent screen, export, erasure, cross-user isolation, and injection tests could not be run against the production system because the required test accounts do not exist. The database-level behavior of these controls is covered by component tests; the production verification remains outstanding.

CSP weakness (SYS-D08, Low). The Content-Security-Policy header permits unsafe-inline and unsafe-eval, weakening XSS protection. This is a known Low-severity defect and was not remediated.

No penetration test. The security verification was read-only and configuration-based. No active penetration testing (SQL injection probes, authentication bypass attempts, session hijacking attempts) was performed against the production system.

Supabase production restore untested. The restore drill was performed against a local database restored from an encrypted backup file. The Supabase-hosted production backup restore procedure was not tested.

Email address not masked. Email addresses — which are personally identifiable information — are present in every email header and are not masked by the PII masker. They are transmitted to the NLP service and stored in the database (unencrypted, because they are needed for display and sender-matching queries). This is a residual privacy risk acknowledged in the design.




References

Backblaze. (2023). The 3-2-1 backup rule: A comprehensive approach. Backblaze Inc. https://www.backblaze.com/blog/the-3-2-1-backup-strategy/

DataReportal. (2025). Digital 2025: The Philippines. Datareportal.com. https://datareportal.com/reports/digital-2025-philippines

Google. (2024). Google API services user data policy. Google LLC. https://developers.google.com/terms/api-services-user-data-policy

Hardt, D. (Ed.). (2012). The OAuth 2.0 authorization framework (RFC 6749). Internet Engineering Task Force. https://www.rfc-editor.org/rfc/rfc6749

Krawczyk, H., & Eronen, P. (2010). HMAC-based extract-and-expand key derivation function (HKDF) (RFC 5869). Internet Engineering Task Force. https://www.rfc-editor.org/rfc/rfc5869

Momjian, B. (2001). PostgreSQL: Introduction and concepts. Addison-Wesley.

National Institute of Standards and Technology. (2001). Advanced encryption standard (AES) (FIPS Publication 197). U.S. Department of Commerce. https://doi.org/10.6028/NIST.FIPS.197

National Privacy Commission. (2023). Guidelines on the use of artificial intelligence systems involving personal data processing. Republic of the Philippines. https://www.privacy.gov.ph

PostgreSQL Global Development Group. (2024). PostgreSQL 16 documentation: Row security policies. https://www.postgresql.org/docs/16/ddl-rowsecurity.html

Republic Act No. 10173. (2012). Data Privacy Act of the Philippines. Republic of the Philippines.

Saltzer, J. H., & Schroeder, M. D. (1975). The protection of information in computer systems. Proceedings of the IEEE, 63(9), 1278–1308.

Zetter, K. (2008). Backup your data the right way with the 3-2-1 rule. Wired. https://www.wired.com/2008/06/backup-your-dat/
