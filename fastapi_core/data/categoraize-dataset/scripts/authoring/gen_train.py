"""TRAIN generator: 24 (category, language) cells x 3 templates x 4 variants = 288, plus 12 calendar-conflict extras = 300.

Template-based synthetic data. Priority and register are fixed per template (a human-style judgment), never computed from rules.
Placeholders: {T:key} task span, {D:key} date span, {S:key} plain slot. The same key inside one email keeps the same pick.
"""
import random
import re

PH = re.compile(r"\{(T|D|S):(\w+)\}")

# ======================================================================= ENGLISH
EN = dict(
    T=dict(
        work=["send the updated sales report", "review the pull request", "fix the failing build", "prepare the client summary", "update the project tracker"],
        sch=["submit your lab report", "upload the assignment to the portal", "finish the group presentation slides", "read chapters 3 to 5"],
        job=["send your updated resume", "complete the skills assessment", "confirm your interview slot", "submit the pre-employment requirements"],
        fin=["settle the outstanding balance", "pay the invoice", "resubmit the receipts", "approve the payment request"],
        alert=["reset your password", "review the recent activity", "free up some storage", "update your payment method"],
        pers=["bring the cake", "book the restaurant", "pick up the kids from school", "send me your RSVP"],
        meet=["confirm your attendance", "send me the agenda", "share your availability", "bring the printed copies"],
    ),
    D=dict(
        today=[("3 PM today", "+0@15:00"), ("5 PM today", "+0@17:00"), ("noon today", "+0@12:00"), ("4 PM this afternoon", "+0@16:00")],
        tmrw=[("tomorrow 9 AM", "+1@09:00"), ("tomorrow at 2 PM", "+1@14:00"), ("tomorrow noon", "+1@12:00"), ("tomorrow 10 AM", "+1@10:00")],
        wk=[("Friday", "fri"), ("Thursday", "thu"), ("Monday", "mon"), ("Wednesday", "wed")],
        far=[("December 5", "2026-12-05"), ("December 12", "2026-12-12"), ("December 15", "2026-12-15"), ("December 20", "2026-12-20")],
        sat=[("Saturday 6 PM", "sat@18:00"), ("Sunday noon", "sun@12:00"), ("Saturday morning", "sat@09:00"), ("Sunday 5 PM", "sun@17:00")],
    ),
    S=dict(
        amount=["PHP 2,300", "PHP 5,400", "PHP 8,750", "PHP 1,150"], name=["Marco", "Diane", "Ana", "Paolo"],
        svc=["prod-api-1", "db-replica-2", "web-03", "queue-worker-4"], pct=["91%", "94%", "97%", "99%"],
        item=["laptops", "sneakers", "phones", "headphones"], off=["30%", "40%", "50%", "60%"],
        place=["Casa", "the Ayala branch", "Tito Ben's house", "the Tagaytay house"], course=["Algorithms", "Statistics", "Operating Systems", "Thesis Writing"],
        co=["Northpoint", "Brightwave", "Lumina Labs", "Kiwi Tech"], role=["Data Analyst", "QA Engineer", "Backend Developer", "Junior Designer"],
        person=["Ate", "Lola", "Tita Mel", "Kuya"], topic=["pricing", "onboarding", "cloud security", "UX trends"],
        inv=["4821", "5310", "6027", "7743"],
    ),
    TPL=[
        # WORK
        ("WORK", "M", 0, 5, "n", "Need this today", "Hi Alex, {T:work} before {D:today}. {S:name} needs it for the meeting. Thanks."),
        ("WORK", "O", 0, 3, "n", "When you have time", "Hey Alex, whenever you can, please {T:work}. {D:wk} is fine."),
        ("WORK", "R", 0, 2, "c", "fyi update", "Hi, just letting you know the {S:svc} deployment went fine and the dashboard shows {S:pct} uptime. Nothing needed from you."),
        # MEET
        ("MEET", "M", 0, 4, "n", "Meeting tomorrow", "Team, we meet {D:tmrw} to review the roadmap. Please {T:meet}."),
        ("MEET", "V", 0, 3, "f", "Schedule a demo of our {S:topic} tool", "Dear Alex, we would love to schedule a call. Are you free on {D:wk}? Kindly {T:meet} so we can book it. Regards, {S:name}, {S:co}"),
        ("MEET", "O", 0, 2, "c", "coffee?", "hey! coffee this {D:sat}? my treat"),
        # SCHOOL
        ("SCHOOL", "O", 0, 4, "f", "{S:course} requirement due", "Dear students, please {T:sch} on or before {D:far}. Late submissions will receive a deduction."),
        ("SCHOOL", "O", 0, 3, "n", "Class announcement", "Hi class, our {S:course} quiz is on {D:wk}. Please {T:sch} beforehand."),
        ("SCHOOL", "O", 0, 2, "c", "notes", "sharing my {S:course} notes from today in case you missed the lecture. hope it helps!"),
        # JOB
        ("JOB", "O", 0, 4, "n", "Next step for the {S:role} role", "Hello Alex, we would like to move you forward at {S:co}. Please {T:job} by {D:wk}."),
        ("JOB", "O", 0, 2, "f", "Application status", "Dear Applicant, thank you for your interest in the {S:role} position at {S:co}. Your application is still under review."),
        ("JOB", "O", 0, 1, "n", "New {S:role} openings for you", "{S:co} and 8 other companies are hiring {S:role}s near you. Browse today's listings."),
        # FIN
        ("FIN", "V", 0, 4, "f", "Invoice {S:inv} is past due", "Dear Customer, invoice {S:inv} for {S:amount} is past due. Kindly {T:fin} by {D:far} to avoid penalties."),
        ("FIN", "O", 0, 3, "n", "Statement available", "Your monthly statement is ready. Amount due: {S:amount}. Due on {D:far}."),
        ("FIN", "O", 0, 2, "n", "Receipt for your payment", "Thanks! We received {S:amount} for your order. This email is your receipt."),
        # PROMO
        ("PROMO", "O", 0, 1, "c", "{S:off} off {S:item} this weekend", "Weekend deal! Save {S:off} on {S:item} while stocks last. Tap to shop."),
        ("PROMO", "O", 0, 1, "n", "Members get early access", "Join today and unlock {S:off} off your first purchase of {S:item}."),
        ("PROMO", "O", 0, 2, "n", "Newsletter: {S:topic}", "This month in {S:topic}: three articles, a podcast episode and a reader Q&A."),
        # ALERT
        ("ALERT", "O", 0, 5, "n", "{S:svc} is down", "Critical: {S:svc} is unreachable and error rates are at {S:pct}. {T:work} and escalate if it persists."),
        ("ALERT", "O", 0, 4, "n", "Unusual activity on your account", "We blocked a suspicious attempt to access your account. Please {T:alert} right away."),
        ("ALERT", "O", 0, 3, "n", "Delivery update", "Your parcel from {S:co} is scheduled to arrive {D:wk}. No action needed."),
        # PERSONAL
        ("PERSONAL", "O", 0, 3, "c", "Dinner at {S:place}", "Hi! We're having dinner at {S:place} on {D:sat}. Can you {T:pers}? Let me know!"),
        ("PERSONAL", "O", 0, 4, "n", "Reminder for {S:person}", "Please {T:pers} by {D:tmrw}. {S:person} is counting on you."),
        ("PERSONAL", "O", 0, 2, "c", "hi!", "Long time no talk! How are you and {S:person} doing? We should catch up {S:place} soon."),
    ],
    CONF=[
        ("MEET", "M", 0, 4, "n", "Meeting {D:tmrw_t}", "Hi team, we have a review {D:tmrw_t}. Please {T:meet}."),
        ("WORK", "D", 1, 4, "n", "Quick call", "Alex, let's talk {D:tmrw_t} about the rollout. {T:work} before then."),
    ],
)

# ======================================================================= MIXED / TAGLISH
MX = dict(
    T=dict(
        work=["i-send ang updated sales report", "i-review ang pull request", "ayusin ang failing build", "ihanda ang client summary", "i-update ang project tracker"],
        sch=["i-submit ang lab report", "i-upload ang assignment sa portal", "tapusin ang slides para sa group presentation", "basahin ang chapters 3 to 5"],
        job=["i-send ang updated resume mo", "kumpletuhin ang skills assessment", "i-confirm ang interview slot mo", "i-submit ang pre-employment requirements"],
        fin=["bayaran ang outstanding balance", "bayaran ang invoice", "i-resubmit ang mga receipt", "i-approve ang payment request"],
        alert=["palitan ang password mo", "i-review ang recent activity", "mag-free up ng storage", "i-update ang payment method mo"],
        pers=["dalhin ang cake", "i-book ang restaurant", "sunduin ang mga bata sa school", "i-reply ang RSVP mo"],
        meet=["i-confirm ang attendance mo", "i-send ang agenda", "sabihin ang availability mo", "dalhin ang printed copies"],
    ),
    D=dict(
        today=[("3 PM mamaya", "+0@15:00"), ("5 PM ngayong araw", "+0@17:00"), ("12 noon today", "+0@12:00"), ("4 PM ngayong hapon", "+0@16:00")],
        tmrw=[("bukas ng 9 AM", "+1@09:00"), ("bukas ng 2 PM", "+1@14:00"), ("bukas ng tanghali", "+1@12:00"), ("bukas ng 10 AM", "+1@10:00")],
        wk=[("Friday", "fri"), ("Huwebes", "thu"), ("Monday", "mon"), ("Wednesday", "wed")],
        far=[("December 5", "2026-12-05"), ("December 12", "2026-12-12"), ("December 15", "2026-12-15"), ("December 20", "2026-12-20")],
        sat=[("Saturday 6 PM", "sat@18:00"), ("Sunday ng tanghali", "sun@12:00"), ("Saturday morning", "sat@09:00"), ("Sunday 5 PM", "sun@17:00")],
    ),
    S=dict(
        amount=["PHP 2,300", "PHP 5,400", "PHP 8,750", "PHP 1,150"], name=["Marco", "Ma'am Diane", "Ana", "Paolo"],
        svc=["prod-api-1", "db-replica-2", "web-03", "queue-worker-4"], pct=["91%", "94%", "97%", "99%"],
        item=["laptops", "sneakers", "phones", "headphones"], off=["30%", "40%", "50%", "60%"],
        place=["Casa", "sa Ayala branch", "sa bahay ni Tito Ben", "sa Tagaytay"], course=["Algorithms", "Statistics", "Operating Systems", "Thesis Writing"],
        co=["Northpoint", "Brightwave", "Lumina Labs", "Kiwi Tech"], role=["Data Analyst", "QA Engineer", "Backend Developer", "Junior Designer"],
        person=["Ate", "Lola", "Tita Mel", "Kuya"], topic=["pricing", "onboarding", "cloud security", "UX trends"],
        inv=["4821", "5310", "6027", "7743"],
    ),
    TPL=[
        ("WORK", "M", 0, 5, "n", "Kailangan ngayon", "Hi Alex, pakisuyo, {T:work} bago ang {D:today}. Kailangan ito ni {S:name} sa meeting. Salamat!"),
        ("WORK", "O", 0, 3, "c", "Pag may time ka", "Uy Alex, pag may time ka, pakisuyo, {T:work} ha. Okay lang sa {D:wk}."),
        ("WORK", "R", 0, 2, "c", "fyi lang", "Hi boss, update lang: maayos ang deployment ng {S:svc} at {S:pct} uptime sa dashboard. Walang kailangan mula sa'yo."),
        ("MEET", "M", 0, 4, "n", "Meeting bukas", "Team, magme-meet tayo {D:tmrw} para sa roadmap review. Pakisuyo, {T:meet}."),
        ("MEET", "V", 0, 3, "f", "Demo ng {S:topic} tool namin", "Good day po, Alex! Gusto po sana naming mag-schedule ng call. Free po ba kayo sa {D:wk}? Pakisuyo, {T:meet} po para ma-book namin. Salamat po, {S:name}, {S:co}"),
        ("MEET", "O", 0, 2, "c", "kape tayo?", "uy! kape tayo this {D:sat}? libre ko"),
        ("SCHOOL", "O", 0, 4, "f", "Requirement sa {S:course}", "Dear students, pakiusap po na {T:sch} on or before {D:far}. May bawas po ang late submissions."),
        ("SCHOOL", "O", 0, 3, "n", "Announcement sa klase", "Hi class, may quiz tayo sa {S:course} sa {D:wk}. Pakisuyo, {T:sch} bago iyon."),
        ("SCHOOL", "O", 0, 2, "c", "notes sa {S:course}", "Sinend ko dito yung notes ko sa {S:course} kung na-miss mo yung lecture. Sana makatulong!"),
        ("JOB", "O", 0, 4, "n", "Next step para sa {S:role}", "Hello Alex, gusto ka naming i-move forward sa {S:co}. Pakisuyo, {T:job} bago mag-{D:wk}."),
        ("JOB", "O", 0, 2, "f", "Status ng application", "Hello po, salamat sa interes ninyo sa {S:role} position sa {S:co}. Under review pa po ang application ninyo."),
        ("JOB", "O", 0, 1, "n", "Bagong {S:role} openings", "Hiring ang {S:co} at 8 pang companies ng {S:role} malapit sa'yo. Tingnan ang listings ngayon."),
        ("FIN", "V", 0, 4, "f", "Past due na ang invoice {S:inv}", "Good day po. Past due na po ang invoice {S:inv} na {S:amount}. Pakisuyo, {T:fin} po bago mag-{D:far} para iwas penalty."),
        ("FIN", "O", 0, 3, "n", "Statement mo ngayong buwan", "Ready na ang monthly statement mo. Amount due: {S:amount}. Due sa {D:far}."),
        ("FIN", "O", 0, 2, "n", "Resibo ng payment", "Salamat! Natanggap namin ang {S:amount} para sa order mo. Ito ang resibo mo."),
        ("PROMO", "O", 0, 1, "c", "{S:off} off sa {S:item} this weekend", "Weekend deal! {S:off} off sa {S:item} habang may stock. I-tap para mag-shop."),
        ("PROMO", "O", 0, 1, "n", "Early access para sa members", "Mag-join na at makakuha ng {S:off} off sa first purchase mo ng {S:item}."),
        ("PROMO", "O", 0, 2, "n", "Newsletter: {S:topic}", "Ngayong buwan sa {S:topic}: tatlong articles, isang podcast episode at reader Q&A."),
        ("ALERT", "O", 0, 5, "n", "Down ang {S:svc}", "Critical: unreachable ang {S:svc} at {S:pct} ang error rate. Pakisuyo, {T:work} at i-escalate kung tuloy-tuloy."),
        ("ALERT", "O", 0, 4, "n", "Kakaibang activity sa account mo", "Nag-block kami ng suspicious na attempt sa account mo. Pakisuyo, {T:alert} agad."),
        ("ALERT", "O", 0, 3, "n", "Update sa delivery", "Darating ang parcel mo mula sa {S:co} sa {D:wk}. Walang kailangang gawin."),
        ("PERSONAL", "O", 0, 3, "c", "Dinner {S:place}", "Hi! May dinner kami {S:place} sa {D:sat}. Pwede mo bang {T:pers}? Sabihan mo ako!"),
        ("PERSONAL", "O", 0, 4, "n", "Paalala para kay {S:person}", "Pakisuyo, {T:pers} bago ang {D:tmrw}. Umaasa si {S:person} sa'yo."),
        ("PERSONAL", "O", 0, 2, "c", "hi!", "Matagal na tayong di nag-usap! Kamusta na kayo ni {S:person}? Catch up tayo {S:place} soon."),
    ],
    CONF=[
        ("MEET", "M", 0, 4, "n", "Meeting {D:tmrw_t}", "Hi team, may review tayo {D:tmrw_t}. Pakisuyo, {T:meet}."),
        ("WORK", "D", 1, 4, "n", "Quick call", "Alex, usap tayo {D:tmrw_t} tungkol sa rollout. Pakisuyo, {T:work} bago iyon."),
    ],
)

# ======================================================================= FILIPINO
TL = dict(
    T=dict(
        work=["ipadala ang na-update na ulat ng benta", "suriin ang pull request", "ayusin ang bumagsak na build", "ihanda ang buod para sa kliyente", "i-update ang talaan ng proyekto"],
        sch=["isumite ang ulat sa laboratoryo", "i-upload ang takdang-aralin sa portal", "tapusin ang slides ng pangkatang ulat", "basahin ang kabanata 3 hanggang 5"],
        job=["ipadala ang inyong na-update na resume", "kumpletuhin ang pagsusulit sa kasanayan", "kumpirmahin ang inyong iskedyul ng panayam", "isumite ang mga kinakailangang dokumento"],
        fin=["bayaran ang natitirang balanse", "bayaran ang invoice", "ipasa muli ang mga resibo", "aprubahan ang hiling na bayad"],
        alert=["palitan ang iyong password", "suriin ang mga kamakailang aktibidad", "magbakante ng espasyo", "i-update ang iyong paraan ng pagbabayad"],
        pers=["dalhin ang keyk", "magpareserba sa restawran", "sunduin ang mga bata sa paaralan", "sagutin ang imbitasyon"],
        meet=["kumpirmahin ang inyong pagdalo", "ipadala ang agenda", "sabihin ang inyong oras na bakante", "dalhin ang mga nakaimprentang kopya"],
    ),
    D=dict(
        today=[("alas-tres ng hapon ngayon", "+0@15:00"), ("alas-singko ngayong araw", "+0@17:00"), ("tanghali ngayon", "+0@12:00"), ("alas-kuwatro ngayong hapon", "+0@16:00")],
        tmrw=[("bukas ng alas-nuwebe ng umaga", "+1@09:00"), ("bukas ng alas-dos ng hapon", "+1@14:00"), ("bukas ng tanghali", "+1@12:00"), ("bukas ng alas-diyes ng umaga", "+1@10:00")],
        wk=[("Biyernes", "fri"), ("Huwebes", "thu"), ("Lunes", "mon"), ("Miyerkules", "wed")],
        far=[("Disyembre 5", "2026-12-05"), ("Disyembre 12", "2026-12-12"), ("Disyembre 15", "2026-12-15"), ("Disyembre 20", "2026-12-20")],
        sat=[("Sabado, alas-sais ng gabi", "sat@18:00"), ("Linggo ng tanghali", "sun@12:00"), ("Sabado ng umaga", "sat@09:00"), ("Linggo, alas-singko ng hapon", "sun@17:00")],
    ),
    S=dict(
        amount=["PHP 2,300", "PHP 5,400", "PHP 8,750", "PHP 1,150"], name=["Marco", "Bb. Diane", "Ana", "Paolo"],
        svc=["prod-api-1", "db-replica-2", "web-03", "queue-worker-4"], pct=["91%", "94%", "97%", "99%"],
        item=["laptop", "sapatos", "cellphone", "headphones"], off=["30%", "40%", "50%", "60%"],
        place=["sa Casa", "sa sangay sa Ayala", "sa bahay ni Tito Ben", "sa Tagaytay"], course=["Algorithms", "Estadistika", "Operating Systems", "Pagsulat ng Tesis"],
        co=["Northpoint", "Brightwave", "Lumina Labs", "Kiwi Tech"], role=["Data Analyst", "QA Engineer", "Backend Developer", "Junior Designer"],
        person=["Ate", "Lola", "Tita Mel", "Kuya"], topic=["pagpepresyo", "onboarding", "seguridad sa cloud", "mga uso sa UX"],
        inv=["4821", "5310", "6027", "7743"],
    ),
    TPL=[
        ("WORK", "M", 0, 5, "f", "Kailangan ngayon", "Magandang araw, Alex. Pakisuyong {T:work} bago mag-{D:today}. Kailangan ito ni {S:name} sa pulong. Salamat po."),
        ("WORK", "O", 0, 3, "n", "Kapag may oras ka", "Alex, kapag may oras ka, pakisuyong {T:work}. Puwede na sa {D:wk}."),
        ("WORK", "R", 0, 2, "f", "Pangkalahatang balita", "Magandang araw po. Maayos po ang deployment ng {S:svc} at {S:pct} ang uptime sa dashboard. Wala po kayong kailangang gawin."),
        ("MEET", "M", 0, 4, "n", "Pulong bukas", "Mga kasama, magkikita tayo {D:tmrw} para sa pagsusuri ng roadmap. Pakisuyong {T:meet}."),
        ("MEET", "V", 0, 3, "f", "Demo ng aming kasangkapan para sa {S:topic}", "Magandang araw po, Alex. Nais po sana naming mag-iskedyul ng tawag. Bakante po ba kayo sa {D:wk}? Pakisuyong {T:meet}. Salamat po, {S:name}, {S:co}"),
        ("MEET", "O", 0, 2, "c", "kape tayo?", "Uy! Kape tayo {D:sat}? Ako ang taya."),
        ("SCHOOL", "O", 0, 4, "f", "Kailangan sa {S:course}", "Mahal na mga mag-aaral, pakisuyong {T:sch} bago o sa {D:far}. May bawas ang huling pasa."),
        ("SCHOOL", "O", 0, 3, "n", "Anunsyo sa klase", "Kumusta, klase. May pagsusulit tayo sa {S:course} sa {D:wk}. Pakisuyong {T:sch} bago iyon."),
        ("SCHOOL", "O", 0, 2, "c", "mga tala sa {S:course}", "Ibinabahagi ko ang aking mga tala sa {S:course} kung hindi ka nakadalo sa lektura. Sana makatulong!"),
        ("JOB", "O", 0, 4, "f", "Susunod na hakbang para sa {S:role}", "Magandang araw po, Alex. Nais po naming ipagpatuloy ang inyong aplikasyon sa {S:co}. Pakisuyong {T:job} bago mag-{D:wk}."),
        ("JOB", "O", 0, 2, "f", "Katayuan ng aplikasyon", "Magandang araw po. Salamat sa interes ninyo sa posisyong {S:role} sa {S:co}. Sinusuri pa po ang inyong aplikasyon."),
        ("JOB", "O", 0, 1, "n", "Mga bagong bakante para sa {S:role}", "Kumukuha ang {S:co} at 8 pang kompanya ng {S:role} malapit sa iyo. Tingnan ang mga listahan ngayon."),
        ("FIN", "V", 0, 4, "f", "Lampas na sa takdang petsa ang invoice {S:inv}", "Magandang araw po. Lampas na po sa takdang petsa ang invoice {S:inv} na {S:amount}. Pakisuyong {T:fin} bago mag-{D:far} upang maiwasan ang multa."),
        ("FIN", "O", 0, 3, "f", "Handa na ang inyong pahayag", "Handa na ang buwanang pahayag ninyo. Halagang dapat bayaran: {S:amount}. Takdang petsa: {D:far}."),
        ("FIN", "O", 0, 2, "f", "Resibo ng inyong bayad", "Salamat po! Natanggap na namin ang {S:amount} para sa inyong order. Ito ang inyong resibo."),
        ("PROMO", "O", 0, 1, "c", "{S:off} diskwento sa {S:item} ngayong weekend", "Bagsak-presyo ngayong weekend! {S:off} diskwento sa {S:item} habang may stock. Mamili na."),
        ("PROMO", "O", 0, 1, "n", "Maagang pag-access para sa miyembro", "Sumali na at makakuha ng {S:off} diskwento sa una mong bibilhing {S:item}."),
        ("PROMO", "O", 0, 2, "n", "Liham-balita: {S:topic}", "Ngayong buwan tungkol sa {S:topic}: tatlong artikulo, isang episode ng podcast at sagutan ng mga mambabasa."),
        ("ALERT", "O", 0, 5, "n", "Bumagsak ang {S:svc}", "Kritikal: hindi maabot ang {S:svc} at {S:pct} ang antas ng error. Pakisuyong {T:work} at i-escalate kung magpatuloy."),
        ("ALERT", "O", 0, 4, "n", "Kahina-hinalang aktibidad sa iyong account", "Humarang kami ng kahina-hinalang pagtatangka sa iyong account. Pakisuyong {T:alert} agad."),
        ("ALERT", "O", 0, 3, "n", "Balita sa padala", "Darating ang iyong parsela mula sa {S:co} sa {D:wk}. Walang kailangang gawin."),
        ("PERSONAL", "O", 0, 3, "c", "Hapunan {S:place}", "Kumusta! May hapunan kami {S:place} sa {D:sat}. Puwede mo bang {T:pers}? Sabihan mo ako!"),
        ("PERSONAL", "O", 0, 4, "n", "Paalala para kay {S:person}", "Pakisuyong {T:pers} bago ang {D:tmrw}. Umaasa si {S:person} sa iyo."),
        ("PERSONAL", "O", 0, 2, "c", "kumusta!", "Matagal na tayong hindi nag-usap! Kumusta na kayo ni {S:person}? Magkita tayo ulit {S:place}."),
    ],
    CONF=[
        ("MEET", "M", 0, 4, "n", "Pulong {D:tmrw_t}", "Mga kasama, may pagsusuri tayo {D:tmrw_t}. Pakisuyong {T:meet}."),
        ("WORK", "D", 1, 4, "n", "Sandaling tawag", "Alex, mag-usap tayo {D:tmrw_t} tungkol sa rollout. Pakisuyong {T:work} bago iyon."),
    ],
)

LANG_DATA = {"en": EN, "mixed": MX, "tl": TL}


def _fill(tpl, data, rng, extra_D=None):
    picks = {}

    def sub(m):
        kind, key = m.group(1), m.group(2)
        k = (kind, key)
        if k not in picks:
            if kind == "T":
                picks[k] = rng.choice(data["T"][key])
            elif kind == "D":
                src = extra_D[key] if extra_D and key in extra_D else data["D"][key]
                picks[k] = rng.choice(src)
            else:
                picks[k] = rng.choice(data["S"][key])
        v = picks[k]
        if kind == "T":
            return f"[[T|{v}|]]"
        if kind == "D":
            return f"[[D|{v[0]}|{v[1]}]]"
        return v

    return PH.sub(sub, tpl), picks


def _recv(rng):
    return f"11-{rng.randint(2, 20):02d} {rng.randint(7, 11):02d}:{rng.choice([0, 5, 10, 15, 20, 30, 40, 45, 50]):02d}"


def _busy_for(code, overlap):
    day, t = code.split("@")
    h, m = map(int, t.split(":"))
    if overlap:
        s, e = (h * 60 + m - 30), (h * 60 + m + 60)
    else:
        s, e = (h * 60 + m + 180), (h * 60 + m + 240)
    f = lambda x: f"{x // 60:02d}:{x % 60:02d}"
    return f"{day}@{f(s)}-{f(e)}"


def make_train(seed, reject):
    """Return list of authoring tuples. `reject(text)` -> True if the text is too close to dev/test/already-accepted."""
    rng = random.Random(seed)
    out = []
    for lang in ("en", "mixed", "tl"):
        data = LANG_DATA[lang]
        for ti, (cat, role, vip, pri, reg, subj, body) in enumerate(data["TPL"]):
            got = 0
            tries = 0
            while got < 4:
                tries += 1
                if tries > 200:
                    raise RuntimeError(f"cannot generate 4 distinct variants: {lang} template {ti} {cat} '{subj}'")
                s_subj, picks_s = _fill(subj, data, rng)
                # reuse same slot picks in the body where keys coincide: do a joint fill
                joint, _ = _fill(subj + "\u0001" + body, data, rng)
                subject, bd = joint.split("\u0001")
                subject = re.sub(r"\[\[[TD]\|([^|\]]*)\|[^\]]*\]\]", r"\1", subject)
                if reject(subject + " " + re.sub(r"\[\[[TD]\|([^|\]]*)\|[^\]]*\]\]", r"\1", bd)):
                    continue
                out.append((cat, lang, role, vip, _recv(rng), subject, bd, pri, reg))
                got += 1
        # calendar-conflict extras: 4 per language (2 overlap, 2 miss)
        conf = data["CONF"]
        for i in range(4):
            cat, role, vip, pri, reg, subj, body = conf[i % 2]
            overlap = i < 2
            for _ in range(200):
                joint, picks = _fill(subj + "\u0001" + body, data, rng, extra_D={"tmrw_t": data["D"]["tmrw"]})
                code = picks[("D", "tmrw_t")][1]
                subject, bd = joint.split("\u0001")
                subject = re.sub(r"\[\[[TD]\|([^|\]]*)\|[^\]]*\]\]", r"\1", subject)
                if reject(subject + " " + re.sub(r"\[\[[TD]\|([^|\]]*)\|[^\]]*\]\]", r"\1", bd)):
                    continue
                out.append((cat, lang, role, vip, _recv(rng), subject, bd, pri, reg, _busy_for(code, overlap)))
                break
            else:
                raise RuntimeError(f"cannot generate conflict extra {lang} {i}")
    return out
