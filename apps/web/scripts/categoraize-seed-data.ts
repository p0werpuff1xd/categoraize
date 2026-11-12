// Demo data for CategorAIze: bilingual (English, Filipino, Taglish) emails
// written to exercise the five acceptance scenarios. All names, addresses and
// numbers are made up.

export type SeedCategory = {
  name: string;
  description: string;
  basePriority: number;
};

export type SeedContact = {
  email: string;
  name: string;
  role: "DIRECT_REPORT" | "MANAGER" | "DIRECTOR_EXECUTIVE" | "EXTERNAL_VENDOR";
  isVip: boolean;
};

export type SeedEmail = {
  key: string;
  from: string;
  subject: string;
  body: string;
  /** Hours before the seed run when the email "arrived". */
  hoursAgo: number;
  /** Which acceptance scenario the email is mainly for. */
  scenario: 1 | 2 | 3 | 4 | 5;
};

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    name: "School",
    description:
      "University coursework: classes, assignments, exams, grades, professors, thesis and enrollment.",
    basePriority: 3,
  },
  {
    name: "Work",
    description:
      "Office work: team projects, reports, meetings with colleagues, client deliverables and deadlines.",
    basePriority: 3,
  },
  {
    name: "Bills and Payments",
    description:
      "Bills and utility statements (electricity, water, internet), credit card statements, invoices, receipts, amounts due and payment confirmations.",
    basePriority: 3,
  },
  {
    name: "Orders",
    description:
      "Online shopping order confirmations, shipping updates and package delivery tracking.",
    basePriority: 2,
  },
  {
    name: "Family and Friends",
    description:
      "Personal messages from family and friends: kumustahan, family gatherings, birthdays, celebrations and weekend plans.",
    basePriority: 2,
  },
];

export const SEED_CONTACTS: SeedContact[] = [
  {
    email: "dean.reyes@example-university.edu.ph",
    name: "Dean Carmela Reyes",
    role: "DIRECTOR_EXECUTIVE",
    isVip: false,
  },
  {
    email: "miguel.santos@example-corp.ph",
    name: "Miguel Santos",
    role: "MANAGER",
    isVip: false,
  },
  {
    email: "printing@example-supplier.ph",
    name: "PrintPro Supplies",
    role: "EXTERNAL_VENDOR",
    isVip: false,
  },
  {
    email: "nanay@example-family.ph",
    name: "Nanay",
    role: "DIRECT_REPORT",
    isVip: true,
  },
];

export const SEED_EMAILS: SeedEmail[] = [
  // Scenario 1: existing labels selected by Sentence-BERT (English, Filipino, Taglish).
  {
    key: "s1-exam",
    from: "Prof. Ana Lim <ana.lim@example-university.edu.ph>",
    subject: "Midterm exam coverage",
    body: "Good morning class. The midterm exam for Data Structures covers chapters 4 to 6. Bring a calculator and your student ID.",
    hoursAgo: 30,
    scenario: 1,
  },
  {
    key: "s1-grades",
    from: "Registrar <registrar@example-university.edu.ph>",
    subject: "Final grades posted",
    body: "Your final grades for the first semester are now available on the student portal.",
    hoursAgo: 52,
    scenario: 1,
  },
  {
    key: "s1-thesis-taglish",
    from: "Prof. Ana Lim <ana.lim@example-university.edu.ph>",
    subject: "Thesis chapter 2",
    body: "Hi, paki-submit naman ng revised thesis chapter 2. Kailangan ko itong i-review bago ang defense ninyo.",
    hoursAgo: 20,
    scenario: 1,
  },
  {
    key: "s1-enrollment-tl",
    from: "Opisina ng Registrar <registrar@example-university.edu.ph>",
    subject: "Paalala sa enrollment",
    body: "Magandang araw! Bukas na ang enrollment para sa ikalawang semestre. Siguraduhing kumpleto ang inyong mga dokumento.",
    hoursAgo: 70,
    scenario: 1,
  },
  {
    key: "s1-work-report",
    from: "Miguel Santos <miguel.santos@example-corp.ph>",
    subject: "Client deck review",
    body: "Team, I reviewed the client presentation. The numbers on slide 7 need to match the latest sales report.",
    hoursAgo: 26,
    scenario: 1,
  },
  {
    key: "s1-work-standup",
    from: "Jessa Cruz <jessa.cruz@example-corp.ph>",
    subject: "Standup notes",
    body: "Notes from today's standup: QA is done with the login module, and the client demo moved to next sprint.",
    hoursAgo: 8,
    scenario: 1,
  },
  {
    key: "s1-work-taglish",
    from: "Jessa Cruz <jessa.cruz@example-corp.ph>",
    subject: "Project timeline",
    body: "Guys, na-update ko na yung project timeline sa shared drive. Pakicheck kung tama yung milestones para sa client.",
    hoursAgo: 15,
    scenario: 1,
  },
  {
    key: "s1-meralco",
    from: "Meralco <billing@example-meralco.ph>",
    subject: "Your electricity bill is ready",
    body: "Your electricity statement for October is now available. Amount due: PHP 2,315.40. Due date: November 25.",
    hoursAgo: 40,
    scenario: 1,
  },
  {
    key: "s1-credit-card",
    from: "BPI Cards <statements@example-bank.ph>",
    subject: "Credit card statement",
    body: "Your credit card statement is ready. Total amount due is PHP 8,940.00 and the minimum amount due is PHP 850.00.",
    hoursAgo: 60,
    scenario: 1,
  },
  {
    key: "s1-internet-tl",
    from: "PLDT Home <billing@example-pldt.ph>",
    subject: "Bayarin sa internet",
    body: "Ang inyong bill sa internet para sa buwan ng Nobyembre ay PHP 1,699. Magbayad bago ang takdang petsa para iwas putol.",
    hoursAgo: 36,
    scenario: 1,
  },
  {
    key: "s1-lazada",
    from: "Lazada <noreply@example-lazada.ph>",
    subject: "Your parcel is out for delivery",
    body: "Your order #8812 is out for delivery and will arrive today. Rider: Juan, contact via the app.",
    hoursAgo: 5,
    scenario: 1,
  },
  {
    key: "s1-shopee-tl",
    from: "Shopee <noreply@example-shopee.ph>",
    subject: "Naipadala na ang order mo",
    body: "Ang iyong package ay nasa delivery hub na at darating sa loob ng dalawang araw. Tracking number: SPX123456.",
    hoursAgo: 28,
    scenario: 1,
  },
  {
    key: "s1-order-confirmed",
    from: "Zalora <orders@example-zalora.ph>",
    subject: "Order confirmed",
    body: "Thank you for shopping! Your order of 2 items has been confirmed and will ship within 48 hours.",
    hoursAgo: 75,
    scenario: 1,
  },
  {
    key: "s1-family-tl",
    from: "Tita Baby <tita.baby@example-family.ph>",
    subject: "Kumusta na kayo?",
    body: "Kumusta na kayo diyan? Uuwi ba kayo sa probinsya ngayong Pasko? Miss na namin kayo.",
    hoursAgo: 48,
    scenario: 1,
  },
  {
    key: "s1-birthday",
    from: "Carlo <carlo.friend@example-mail.ph>",
    subject: "Birthday dinner",
    body: "Hey! We're having a small birthday dinner for Bea this weekend. Let me know if you can come.",
    hoursAgo: 22,
    scenario: 1,
  },

  // Scenario 2: emails that fit no existing label, so a library label is suggested.
  {
    key: "s2-interview",
    from: "Talent Team <careers@example-tech.ph>",
    subject: "Interview invitation: Junior Software Engineer",
    body: "Thank you for applying to our company. We would like to invite you to a job interview with our hiring manager. Please confirm your availability for this week.",
    hoursAgo: 10,
    scenario: 2,
  },
  {
    key: "s2-flight",
    from: "Cebu Pacific <booking@example-airline.ph>",
    subject: "Your flight booking is confirmed",
    body: "Booking reference XJ72Q. Manila to Cebu, departing December 20 at 6:10 AM. Online check-in opens 24 hours before departure.",
    hoursAgo: 55,
    scenario: 2,
  },
  {
    key: "s2-security",
    from: "Google <no-reply@example-accounts.com>",
    subject: "Security alert",
    body: "A new sign-in to your account was detected on a Windows device. If this was not you, reset your password now.",
    hoursAgo: 3,
    scenario: 2,
  },
  {
    key: "s2-webinar",
    from: "DevCon PH <events@example-devcon.ph>",
    subject: "You're registered: AI for Filipino Developers webinar",
    body: "You are registered for our webinar on Saturday at 2 PM. The event link will be sent one hour before the session.",
    hoursAgo: 45,
    scenario: 2,
  },
  {
    key: "s2-government-tl",
    from: "PhilHealth <noreply@example-philhealth.gov.ph>",
    subject: "Paalala tungkol sa inyong kontribusyon",
    body: "Ito ay paalala na i-update ang inyong impormasyon sa member portal para sa inyong benepisyo at kontribusyon.",
    hoursAgo: 80,
    scenario: 2,
  },
  {
    key: "s2-newsletter",
    from: "Tech Weekly <newsletter@example-news.ph>",
    subject: "This week in tech",
    body: "Our top stories this week: new phones, faster AI chips and a look at the best budget laptops of the year.",
    hoursAgo: 65,
    scenario: 2,
  },

  // Scenario 3: Taglish instructions with "bukas" and other Filipino date words.
  {
    key: "s3-bukas-report",
    from: "Miguel Santos <miguel.santos@example-corp.ph>",
    subject: "Weekly report",
    body: "Hi team, paki-send ang final weekly report bukas. Salamat!",
    hoursAgo: 2,
    scenario: 3,
  },
  {
    key: "s3-bukas-ng-umaga",
    from: "Prof. Ana Lim <ana.lim@example-university.edu.ph>",
    subject: "Lab report",
    body: "Class, ipasa ninyo ang lab report bukas ng umaga. Hindi na tatanggapin ang late submissions.",
    hoursAgo: 4,
    scenario: 3,
  },
  {
    key: "s3-biyernes",
    from: "Jessa Cruz <jessa.cruz@example-corp.ph>",
    subject: "Slides para sa client",
    body: "Pakicheck naman yung slides sa Biyernes bago natin i-present sa client.",
    hoursAgo: 6,
    scenario: 3,
  },
  {
    key: "s3-mamaya",
    from: "Miguel Santos <miguel.santos@example-corp.ph>",
    subject: "Quick fix",
    body: "Paki-update yung pricing table mamaya, may mali sa discount column.",
    hoursAgo: 1,
    scenario: 3,
  },
  {
    key: "s3-hanggang",
    from: "Org Secretary <secretary@example-org.ph>",
    subject: "Membership form",
    body: "Pakisagot ang membership form hanggang mamayang gabi para ma-include ka sa listahan.",
    hoursAgo: 3,
    scenario: 3,
  },
  {
    key: "s3-susunod-na-linggo",
    from: "Prof. Ana Lim <ana.lim@example-university.edu.ph>",
    subject: "Group project",
    body: "Ipasa ang group project proposal sa susunod na linggo. Isang proposal lang bawat grupo.",
    hoursAgo: 12,
    scenario: 3,
  },

  // Scenario 4: near-term deadline versus an otherwise identical email.
  {
    key: "s4-budget-deadline",
    from: "Jessa Cruz <jessa.cruz@example-corp.ph>",
    subject: "Budget sheet",
    body: "Please update the Q4 budget sheet by tomorrow.",
    hoursAgo: 1,
    scenario: 4,
  },
  {
    key: "s4-budget-no-deadline",
    from: "Jessa Cruz <jessa.cruz@example-corp.ph>",
    subject: "Budget sheet",
    body: "Please update the Q4 budget sheet.",
    hoursAgo: 1,
    scenario: 4,
  },
  {
    key: "s4-essay-today",
    from: "Prof. Ana Lim <ana.lim@example-university.edu.ph>",
    subject: "Reflection essay",
    body: "Kindly submit your reflection essay today before 5 PM.",
    hoursAgo: 2,
    scenario: 4,
  },
  {
    key: "s4-essay-no-deadline",
    from: "Prof. Ana Lim <ana.lim@example-university.edu.ph>",
    subject: "Reflection essay",
    body: "Kindly submit your reflection essay.",
    hoursAgo: 2,
    scenario: 4,
  },
  {
    key: "s4-dean-memo",
    from: "Dean Carmela Reyes <dean.reyes@example-university.edu.ph>",
    subject: "Accreditation documents",
    body: "Please send the accreditation documents for your department by Friday.",
    hoursAgo: 9,
    scenario: 4,
  },
  {
    key: "s4-manager-request",
    from: "Miguel Santos <miguel.santos@example-corp.ph>",
    subject: "Client feedback summary",
    body: "Can you prepare a one-page summary of the client feedback? Thanks.",
    hoursAgo: 11,
    scenario: 4,
  },
  {
    key: "s4-vip-nanay",
    from: "Nanay <nanay@example-family.ph>",
    subject: "Tawag ka mamaya",
    body: "Anak, tawagan mo ako pag may oras ka. May sasabihin ako tungkol sa reunion.",
    hoursAgo: 7,
    scenario: 4,
  },
  {
    key: "s4-vendor",
    from: "PrintPro Supplies <printing@example-supplier.ph>",
    subject: "Quotation for brochures",
    body: "Attached is our quotation for 500 brochures. Kindly confirm the order so we can schedule printing.",
    hoursAgo: 30,
    scenario: 4,
  },
  {
    key: "s4-overdue",
    from: "Meralco <billing@example-meralco.ph>",
    subject: "Payment reminder",
    body: "Please pay your overdue balance of PHP 1,980.00 today to avoid disconnection.",
    hoursAgo: 4,
    scenario: 4,
  },

  // Scenario 5: borderline emails between two labels; correcting one moves the centroids.
  {
    key: "s5-tuition-taglish",
    from: "Accounting Office <accounting@example-university.edu.ph>",
    subject: "Tuition payment",
    body: "Paki-settle naman ang tuition fee balance para sa second semester bago ang enrollment.",
    hoursAgo: 18,
    scenario: 5,
  },
  {
    key: "s5-tuition-reminder",
    from: "Accounting Office <accounting@example-university.edu.ph>",
    subject: "Tuition reminder",
    body: "Reminder: the remaining tuition fee for the semester must be paid at the cashier.",
    hoursAgo: 14,
    scenario: 5,
  },
  {
    key: "s5-lab-fee",
    from: "Accounting Office <accounting@example-university.edu.ph>",
    subject: "Laboratory fee",
    body: "Your laboratory fee of PHP 1,500 for Chemistry is still unpaid. Settle it at the cashier.",
    hoursAgo: 33,
    scenario: 5,
  },
  {
    key: "s5-reimbursement",
    from: "Finance Team <finance@example-corp.ph>",
    subject: "Reimbursement approved",
    body: "Your travel reimbursement of PHP 3,200 for the client visit was approved and will be credited on payday.",
    hoursAgo: 50,
    scenario: 5,
  },
  {
    key: "s5-payroll",
    from: "HR <hr@example-corp.ph>",
    subject: "Payslip for November 1-15",
    body: "Your payslip for the November 1-15 cutoff is now available in the HR portal.",
    hoursAgo: 72,
    scenario: 5,
  },
  {
    key: "s5-team-dinner",
    from: "Jessa Cruz <jessa.cruz@example-corp.ph>",
    subject: "Team dinner Friday",
    body: "Team dinner tayo sa Friday after work! Libre ni boss. Sino sasama?",
    hoursAgo: 24,
    scenario: 5,
  },
  {
    key: "s5-org-fee",
    from: "Org Treasurer <treasurer@example-org.ph>",
    subject: "Org membership fee",
    body: "Hi members! Pakibayad na po ng membership fee na PHP 200 sa treasurer.",
    hoursAgo: 40,
    scenario: 5,
  },
  {
    key: "s5-graduation-photos",
    from: "Batch Officers <officers@example-org.ph>",
    subject: "Graduation photo package",
    body: "The graduation photo package costs PHP 1,200. Payment and sizes are due at the student lounge.",
    hoursAgo: 58,
    scenario: 5,
  },
];
