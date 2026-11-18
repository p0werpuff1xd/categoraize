# Balance report


## train (n=300)

- **language**: en=100, mixed=100, tl=100
- **gold_category**: alerts=36, finance_billing=36, job_search=36, meetings=42, personal=36, promotions=36, school=36, work_tasks=42
- **gold_priority**: 1=36, 2=84, 3=72, 4=84, 5=24
- **gold_register**: casual=72, formal=68, neutral=160
- **sender_role**: Direct Report=12, Director/Executive=6, External Vendor=24, Manager=30, Other=228
- **spans**: TASK=156, DATE=168 (ambiguous dates: 0)
- **emails with a calendar conflict**: 6 of 12 with busy data
- **VIP senders**: 6

  category x language:
  - work_tasks: en=14, mixed=14, tl=14
  - meetings: en=14, mixed=14, tl=14
  - school: en=12, mixed=12, tl=12
  - job_search: en=12, mixed=12, tl=12
  - finance_billing: en=12, mixed=12, tl=12
  - promotions: en=12, mixed=12, tl=12
  - alerts: en=12, mixed=12, tl=12
  - personal: en=12, mixed=12, tl=12

## dev (n=30)

- **language**: en=10, mixed=10, tl=10
- **gold_category**: alerts=3, finance_billing=3, job_search=3, meetings=5, personal=3, promotions=3, school=4, work_tasks=6
- **gold_priority**: 1=3, 2=5, 3=5, 4=15, 5=2
- **gold_register**: casual=10, formal=6, neutral=14
- **sender_role**: Direct Report=1, Director/Executive=2, External Vendor=3, Manager=3, Other=21
- **spans**: TASK=20, DATE=21 (ambiguous dates: 0)
- **emails with a calendar conflict**: 0 of 0 with busy data
- **VIP senders**: 2

  category x language:
  - work_tasks: en=2, mixed=2, tl=2
  - meetings: en=1, mixed=2, tl=2
  - school: en=2, mixed=1, tl=1
  - job_search: en=1, mixed=1, tl=1
  - finance_billing: en=1, mixed=1, tl=1
  - promotions: en=1, mixed=1, tl=1
  - alerts: en=1, mixed=1, tl=1
  - personal: en=1, mixed=1, tl=1

## test (n=100)

- **language**: en=34, mixed=33, tl=33
- **gold_category**: alerts=12, finance_billing=13, job_search=9, meetings=12, personal=14, promotions=13, school=13, work_tasks=14
- **gold_priority**: 1=11, 2=24, 3=28, 4=29, 5=8
- **gold_register**: casual=23, formal=25, neutral=52
- **sender_role**: Direct Report=3, Director/Executive=6, External Vendor=7, Manager=10, Other=74
- **spans**: TASK=61, DATE=70 (ambiguous dates: 3)
- **emails with a calendar conflict**: 4 of 7 with busy data
- **VIP senders**: 6

  category x language:
  - work_tasks: en=5, mixed=5, tl=4
  - meetings: en=4, mixed=4, tl=4
  - school: en=4, mixed=4, tl=5
  - job_search: en=4, mixed=3, tl=2
  - finance_billing: en=4, mixed=4, tl=5
  - promotions: en=5, mixed=4, tl=4
  - alerts: en=4, mixed=4, tl=4
  - personal: en=4, mixed=5, tl=5
