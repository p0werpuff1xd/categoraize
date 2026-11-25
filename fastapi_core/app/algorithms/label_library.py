"""Curated label templates for suggesting a new category.

Suggestions come only from this fixed library, never invented names, and
only when no existing category matched. Creating the label is always the
user's decision.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class LabelTemplate:
    key: str
    name: str
    description: str


LABEL_TEMPLATES: tuple[LabelTemplate, ...] = (
    LabelTemplate("academics", "Academics", "School and university coursework: classes, assignments, exams, grades, professors, enrollment and thesis work."),
    LabelTemplate("meetings", "Meetings", "Meeting invitations, scheduling, rescheduling, agendas and minutes for calls and conferences."),
    LabelTemplate("finance", "Finance", "Bills, invoices, receipts, payments, bank statements, tuition fees, payroll and reimbursements."),
    LabelTemplate("travel", "Travel", "Flight, bus and hotel bookings, itineraries, boarding passes, check-in reminders and travel changes."),
    LabelTemplate("deliveries", "Deliveries", "Online order confirmations, shipping updates, package tracking and delivery notices."),
    LabelTemplate("jobs", "Jobs", "Job applications, interviews, recruiters, internship offers and employment paperwork."),
    LabelTemplate("security", "Security", "Account security alerts, password resets, sign-in notifications and verification codes."),
    LabelTemplate("newsletters", "Newsletters", "Newsletters, digests, blog updates and subscription content to read later."),
    LabelTemplate("promotions", "Promotions", "Sales, discounts, coupons, product launches and marketing offers."),
    LabelTemplate("events", "Events", "Event invitations, webinars, seminars, registrations, tickets and reminders for upcoming events."),
    LabelTemplate("support", "Support", "Customer support tickets, help desk replies, service requests and issue status updates."),
    LabelTemplate("government", "Government", "Government agencies, permits, IDs, taxes, benefits and official notices."),
    LabelTemplate("developer", "Dev & IT", "Software development notifications: GitHub pull requests and issues, CI build and test failures, deployments, code reviews and cloud hosting alerts."),
    LabelTemplate("social", "Social", "Social network notifications: LinkedIn, Facebook and community updates, connection requests, mentions, comments and people you may know."),
)
