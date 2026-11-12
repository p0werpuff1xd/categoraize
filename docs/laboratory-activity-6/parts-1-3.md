# Laboratory Activity 6: Use Case Diagram Development

**Course:** Software Engineering 1  
**Project:** CategorAIze Email Intelligence System  
**Coverage:** Parts 1, 2, and 3

## Part 1: Project Scope and Actor Identification

### Project scope

This diagram follows the approved CategorAIze project scope in the team's activity worksheet: email account connection, categorization and prioritization, analysis and deadline review, notifications, email search and cleanup, reply drafting, and Google Calendar availability and deadline export. The scope models the Gmail integration named in the proposal. CategorAIze's web application, background processing, data store, and NLP capabilities are inside the system boundary.

Students, professionals, and other people who manage email use the same mailbox features and permissions in this project scope. They are represented by one **Email User** actor rather than separate actors. Organization administration, deployment administration, and other inherited application features are outside this approved project scope.

### Actor inventory

| Actor | Description | Main Interaction with the System |
| --- | --- | --- |
| Email User (Primary Actor) | A person, such as a student or professional, who connects and manages their own Gmail mailbox. | Connects the email account, creates custom categories, views categorized and prioritized messages, checks summaries and deadlines, views notifications, searches and cleans email, drafts replies, and corrects classifications. |
| Gmail Service | External email and OAuth service used by the approved project workflows. | Authorizes mailbox access, supplies messages and updates, stores drafts, sends approved replies, and applies requested mailbox changes. |
| Google Calendar Service | External calendar service connected with the user's consent. | Supplies availability and creates calendar events after the user confirms an export. |

## Part 2: Use Case Identification

| **Actor** | **Use Case** | **Purpose** |
| --------------- | ------------------ | -------------------------------------------------- |
| Email User | Connect Email Account | Allows the user to sign in and authorize CategorAIze to access Gmail. |
| Gmail Service | Connect Email Account | Provides OAuth authorization and mailbox access. |
| Email User | Synchronize Email | Allows the user to retrieve new and updated messages for processing and review. |
| Gmail Service | Synchronize Email | Supplies new and updated messages from the connected mailbox. |
| Email User | Manage Categories | Allows the user to create, edit, activate, or remove categories and set classification preferences. |
| Email User | Review Email Analysis | Allows the user to inspect category predictions, priority explanations, summaries, suggested actions, and deadlines when available. |
| Email User | Correct Email Classification | Allows the user to correct an email's category to improve future predictions. |
| Email User | Search Email | Allows the user to find relevant messages using semantic search and available filters. |
| Email User | Review Tasks and Deadlines | Allows the user to review extracted actions, approaching deadlines, and important dates. |
| Email User | Prepare Reply Draft | Allows the user to generate and edit a contextual reply before saving it as a Gmail draft. |
| Gmail Service | Prepare Reply Draft | Stores the reply in Gmail Drafts when requested. |
| Email User | Check Calendar Availability | Allows the user to check available dates and times for scheduling. |
| Google Calendar Service | Check Calendar Availability | Provides availability information from the connected calendar. |
| Email User | Send Approved Reply | Allows the user to send a reviewed reply after confirming it. |
| Gmail Service | Send Approved Reply | Sends the reply after receiving the user's confirmed request. |
| Email User | Clean Up Inbox | Allows the user to archive selected messages, unsubscribe from unwanted emails, or configure unwanted-email blocking. |
| Gmail Service | Clean Up Inbox | Applies requested mailbox changes and supports unsubscribe actions. |
| Email User | Export Deadline to Calendar | Allows the user to review and confirm an extracted deadline before creating a calendar event. |
| Google Calendar Service | Export Deadline to Calendar | Creates a calendar event after the user confirms its details. |
| Email User | View Email Notifications | Allows the user to view notifications about important messages and upcoming deadlines. |

## Part 3: UML Use Case Diagram Construction

![CategorAIze email intelligence UML use case diagram](use-case-diagram.png)

### Diagram explanation

- The rectangle labeled **CategorAIze Email Intelligence System** is the system boundary.
- Email User, Gmail Service, and Google Calendar Service are outside the boundary; the thirteen use cases are inside it.
- Association lines connect each actor to the use cases they participate in.
- **Correct Email Classification** `<<extend>>` **Review Email Analysis** because correcting a prediction is an optional action during analysis review.
- **Export Deadline to Calendar** `<<extend>>` **Review Tasks and Deadlines** because exporting a reviewed deadline is an optional action during task review.

## Part 4: Peer Review and Requirements Validation

### Review checklist

| Checklist item | Result |
| --- | --- |
| System boundary is clearly labeled. | Met |
| Actors are outside the system boundary. | Met |
| Use cases are inside the system boundary. | Met |
| Use case names describe meaningful system services. | Met |
| Actors are connected to the appropriate use cases. | Met |
| Diagram reflects the approved project scope. | Met |
| Major user interactions are represented. | Met |
| No obvious missing or contradictory interactions remain after revision. | Met |
| Diagram is readable and properly organized after spacing revisions. | Met |

### Peer feedback

**Two strengths**

1. The diagram is clear and well organized, with the system boundary, actors, and use cases properly labeled.
2. It shows important functions, including email categorization, email analysis, and task and deadline management, as well as the Gmail and Google Calendar integrations.

**Two recommendations**

1. Improve spacing between use cases and association lines to make the diagram easier to read.
2. Show that **Correct Email Classification** is an optional action during **Review Email Analysis**, and that **Export Deadline to Calendar** is an optional action during **Review Tasks and Deadlines**, using `<<extend>>` relationships.

**Potentially missing use case**

- **UC13: View Email Notifications** lets the user view notices about important messages and upcoming deadlines. This use case has been added to the revised diagram and inventory.

## Part 5: Revision Notes

1. **Improved spacing:** Reorganized the use cases and actor association lines to make the diagram clearer.
2. **Added use case relationships:** Added `<<extend>>` from **Correct Email Classification** to **Review Email Analysis**, and from **Export Deadline to Calendar** to **Review Tasks and Deadlines**. Both extensions describe optional actions in the related review flow.
3. **Added UC13, View Email Notifications:** Added the use case to represent notices about important emails and upcoming deadlines.

The consolidated PDF contains Parts 1–5 completed to date. The team's 3–5-minute presentation is still to be prepared for the final submission.
