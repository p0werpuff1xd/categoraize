import type { Metadata } from "next";
import Link from "next/link";
import { LegalDraftPage } from "@/app/(landing)/LegalDraftPage";
import { CATEGORAIZE_PRIVACY_VERSION } from "@/utils/categoraize/consent";
import { TERMS_PATH } from "@/utils/categoraize/consent-paths";
import { BRAND_NAME, getBrandTitle } from "@/utils/branding";

export const metadata: Metadata = { title: getBrandTitle("Privacy Notice") };

export default function PrivacyPage() {
  return (
    <LegalDraftPage
      title="Privacy Notice"
      version={CATEGORAIZE_PRIVACY_VERSION}
    >
      <p>
        This notice explains what {BRAND_NAME} does with your personal data,
        under the Data Privacy Act of 2012 (Republic Act No. 10173). It goes
        with the{" "}
        <Link href={TERMS_PATH} className="underline">
          Terms of Use
        </Link>
        .
      </p>

      <h2>1. Who is responsible</h2>
      <p>
        Personal information controller: Categoraize, contact email
        support.categoraize@gmail.com. Data protection contact: Categoraize,
        support.categoraize@gmail.com.
      </p>

      <h2>2. What we process and why</h2>
      <ul>
        <li>
          <strong>Account data</strong> (name, email address, profile picture)
          from Google or Microsoft sign-in, to create your account.
        </li>
        <li>
          <strong>Access tokens</strong> for the mailbox, calendar and file
          storage you connect, to read and organize mail on your behalf. They
          are stored encrypted.
        </li>
        <li>
          <strong>Email content</strong> (sender, subject, text) of the emails
          the app analyzes, to sort them into your labels, find tasks and
          deadlines, set a priority and write summaries. Attachments are not
          analyzed.
        </li>
        <li>
          <strong>Calendar busy times</strong> (start and end only, no titles),
          if you connect a calendar, to raise the priority of a deadline that
          falls in a busy period.
        </li>
        <li>
          <strong>Your corrections and settings</strong> (labels, contacts and
          their roles, priority changes), to adapt the app to you. These stay in
          your account; they are never used to train a model shared with other
          users.
        </li>
        <li>
          <strong>A security log</strong> (sign-ins, connected accounts, consent
          changes), with IDs and flags only, never email content or IP
          addresses.
        </li>
      </ul>
      <p>
        Legal basis: your consent, which you give on first sign-in and can
        withdraw at any time.
      </p>

      <h2>3. Who receives your data</h2>
      <ul>
        <li>
          <strong>Google or Microsoft</strong>, as the providers of the mailbox
          you connect.
        </li>
        <li>
          <strong>{BRAND_NAME}'s language service</strong>, run by the project
          team. It receives the text of an email and your label descriptions,
          returns the result and keeps no copy. It never receives your access
          tokens.
        </li>
        <li>
          <strong>OpenRouter (external AI provider)</strong>, only if you turn
          on external AI processing (off by default): the parts of an email
          needed to draft a reply or to decide an unsure case.
        </li>
        <li>
          <strong>Hosting providers</strong> for the database and the app
          (Supabase for the database), under their own security terms.
        </li>
      </ul>
      <p>We do not sell your data or use it for advertising.</p>

      <h2>4. How long we keep it, and backups</h2>
      <ul>
        <li>
          Analysis results and your settings are kept while your account exists
          and are deleted when you delete your account.
        </li>
        <li>
          Encrypted backups of your account details, settings, labels and
          analysis results (never email text or access tokens) are kept for up
          to 7 daily and 4 weekly copies. If you delete your account, your data
          is removed from any backup that is restored later.
        </li>
        <li>The security log is kept for the life of the project.</li>
      </ul>

      <h2>5. Your rights under RA 10173</h2>
      <ul>
        <li>
          <strong>Be informed</strong> through this notice.
        </li>
        <li>
          <strong>Access</strong> your data and the security log of your
          account.
        </li>
        <li>
          <strong>Correct</strong> labels, priorities and contact roles in the
          app.
        </li>
        <li>
          <strong>Erasure</strong>: delete your account in Settings, which
          deletes your {BRAND_NAME} data.
        </li>
        <li>
          <strong>Object and withdraw consent</strong>: withdraw in Settings;
          the app then stops reading your mailbox.
        </li>
        <li>
          <strong>Data portability</strong> and <strong>complaint</strong>:
          contact us, or file a complaint with the National Privacy Commission.
        </li>
      </ul>

      <h2>6. How we protect your data</h2>
      <p>Controls in place now:</p>
      <ul>
        <li>Access tokens encrypted at rest (AES-256-GCM).</li>
        <li>
          Every page and API checks that you own the account you are viewing.
        </li>
        <li>
          The language service requires a secret key and receives no tokens.
        </li>
        <li>Sign-in uses signed OAuth state and PKCE.</li>
        <li>An append-only security log.</li>
        <li>
          Encrypted backups that leave out email text and access tokens, with a
          restore test that also rejects altered backup files.
        </li>
      </ul>

      <h2>7. Breaches</h2>
      <p>
        If a personal data breach puts you at real risk, we will notify you and
        the National Privacy Commission within 72 hours of learning of it.
      </p>

      <h2>8. Changes</h2>
      <p>
        If this notice changes, the version above changes and you will be asked
        to accept it again.
      </p>
    </LegalDraftPage>
  );
}
