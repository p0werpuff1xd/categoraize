import type { Metadata } from "next";
import Link from "next/link";
import { LegalDraftPage } from "@/app/(landing)/LegalDraftPage";
import { CATEGORAIZE_TERMS_VERSION } from "@/utils/categoraize/consent";
import { PRIVACY_PATH } from "@/utils/categoraize/consent-paths";
import { BRAND_NAME, getBrandTitle } from "@/utils/branding";

export const metadata: Metadata = { title: getBrandTitle("Terms") };

export default function TermsPage() {
  return (
    <LegalDraftPage title="Terms of Use" version={CATEGORAIZE_TERMS_VERSION}>
      <p>
        {BRAND_NAME} is a capstone project: an email classification and
        prioritization system built on the open-source Inbox Zero. By accepting
        these Terms you agree to the conditions below. How we handle your data
        is described in the{" "}
        <Link href={PRIVACY_PATH} className="underline">
          Privacy Notice
        </Link>
        .
      </p>

      <h2>1. The service</h2>
      <ul>
        <li>
          {BRAND_NAME} reads the mailbox you connect (Gmail or Outlook) to sort
          emails into your labels, find tasks and deadlines, set a priority from
          P1 to P5 and write short summaries.
        </li>
        <li>
          This work runs on {BRAND_NAME}'s own language service. Drafted replies
          use an external AI provider only if you turn that on.
        </li>
        <li>
          It is a student project offered for testing and demonstration, with no
          guarantee of availability. Do not rely on it as your only way to track
          important email.
        </li>
      </ul>

      <h2>2. Your account and your choices</h2>
      <ul>
        <li>
          You must be the owner of, or authorized to use, every mailbox you
          connect.
        </li>
        <li>
          Labels, priorities and deadlines are suggestions. You review and can
          change them. Drafted replies are never sent automatically; you review
          and send them yourself.
        </li>
        <li>
          You can withdraw your consent in Settings at any time, which stops the
          app from reading your mailbox, and you can delete your account.
        </li>
      </ul>

      <h2>3. Acceptable use</h2>
      <ul>
        <li>
          Do not use the service to break the law or to access mail you are not
          allowed to read.
        </li>
        <li>Do not try to bypass access controls or attack the service.</li>
      </ul>

      <h2>4. Limits</h2>
      <ul>
        <li>
          Automatic classification can be wrong. The project team is not
          responsible for decisions made only on its suggestions.
        </li>
        <li>
          The source code is licensed under the GNU Affero General Public
          License v3, like the Inbox Zero project it is based on.
        </li>
      </ul>

      <h2>5. Changes</h2>
      <p>
        If these Terms change, the version above changes and you will be asked
        to accept them again before the app reads your mailbox.
      </p>

      <h2>6. Contact</h2>
      <p>Categoraize, support.categoraize@gmail.com</p>
    </LegalDraftPage>
  );
}
