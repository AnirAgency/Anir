/**
 * The task list («Даалгавар», «Тайлан») — the admin's words for it. Apart
 * from src/content/admin.ts so the admin loads them only with the tool
 * (src/scripts/admin-tasks.ts). Proofread with the rest:
 * `npm run copy:export -- --admin` lists them in their place.
 */
/**
 * The team's task list (worker/tasks.ts, src/scripts/admin-tasks.ts). Codes
 * stored, these words shown — src/lib/task-codes.ts names the codes, and
 * the admin page's build fails if one has no words here (checkAdmin).
 */
export const tasks = {
  help: 'Багийн ажил: хэн юуг хийх, хэзээ гэхэд, хэн батлах. Анх нээхэд — танд оноосон ажил, таны баталгааг хүлээж буй ажил. Бусад нь шүүлтүүрээр.',
  states: {
    new: 'Шинэ',
    doing: 'Хийж байна',
    submitted: 'Хийсэн',
    approved: 'Баталсан',
  } as Record<string, string>,
  projects: {
    site: 'Сайт',
    ezmath: 'Ezmath',
    ethos: 'Ethos',
    olymo: 'Olymo',
    other: 'Бусад',
  } as Record<string, string>,
  views: {
    mine: 'Минийх',
    all: 'Бүгд',
  } as Record<string, string>,
  filters: {
    owner: 'Хэн хийх',
    project: 'Төсөл',
    state: 'Төлөв',
    overdue: 'Зөвхөн хугацаа хэтэрсэн',
    any: 'Бүгд',
  },
  /** A task's fields, and the line of help under each. */
  fields: {
    title: 'Гарчиг',
    done_means: 'Дууссан гэдэг нь',
    project: 'Төсөл',
    owner_id: 'Хэн хийх',
    approver_id: 'Хэн батлах',
    due_date: 'Хугацаа',
  } as Record<string, string>,
  fieldHelp: {
    title: 'Юу хийх вэ — нэг мөрөөр.',
    done_means:
      'Юу болсон байхад дууссан гэж үзэх вэ — шалгаж болохуйц зүйл. Гарчгаа давтахгүй: «Ezmath-ын бодлогуудыг дуусгах» биш, «7-р ангийн 40 бодлого шийдлийн хамт Ezmath-д орсон». Батлах хүн үүгээр шалгана.',
    project: 'Аль ажилд хамаарах вэ.',
    owner_id: 'Ажлыг хийх хүн.',
    approver_id: 'Хийсэн гэж илгээхэд батлах эсвэл буцаах хүн. Анх — даалгаврыг үүсгэсэн хүн.',
    due_date: 'Заавал биш. Өнгөрвөл жагсаалтад «Хугацаа хэтэрсэн» гэж гарна.',
  } as Record<string, string>,
  /** Length guidance under a field, never a limit. */
  guide: '{n} / {max} тэмдэгт — үүнээс урт бол уншихад хэцүү болно.',
  new: 'Шинэ даалгавар',
  edit: 'Засах',
  save: 'Хадгалах',
  cancel: 'Болих',
  saved: 'Хадгаллаа.',
  moves: {
    start: 'Эхлүүлэх',
    submit: 'Хийсэн гэж илгээх',
    approve: 'Батлах',
    sendBack: 'Буцаах',
    reopen: 'Дахин нээх',
  } as Record<string, string>,
  /** The reason a move needs, by move: its label, the line under it, and what is said when it is missing. */
  reasons: {
    sendBack: 'Буцаах шалтгаан',
    reopen: 'Дахин нээх шалтгаан',
  } as Record<string, string>,
  reasonHelp: {
    sendBack: 'Юу дутуу байгааг бичнэ — шалтгаангүй буцаахгүй.',
    reopen: 'Яагаад буцааж нээж байгаагаа бичнэ — алдаатай баталсан бол түүнийгээ.',
  } as Record<string, string>,
  reasonRequired: {
    sendBack: 'Буцаах шалтгаанаа бичнэ үү.',
    reopen: 'Дахин нээх шалтгаанаа бичнэ үү.',
  } as Record<string, string>,
  /** The overdue marker: a word and a sign, never colour alone. */
  overdue: '⚠ Хугацаа хэтэрсэн',
  due: 'Хугацаа: {date}',
  owner: 'Хийх: {who}',
  approver: 'Батлах: {who}',
  sentBack: 'Буцаасан шалтгаан: {reason}',
  empty: 'Энд одоогоор ажил алга.',
  emptyMine: 'Танд оноосон, таны баталгааг хүлээж буй ажил алга.',
  loading: 'Ачаалж байна…',
  failed: 'Даалгавруудыг ачаалж чадсангүй. Нэг минутын дараа дахин оролдоно уу.',
  /** Why a write was refused, by the Worker's code. «conflict» is the shared sentence (conflict, above). */
  errors: {
    title: 'Гарчиг хоосон эсвэл хэт урт байна.',
    'done-means': '«Дууссан гэдэг нь» хоосон эсвэл хэт урт байна.',
    'done-means-repeats-title': '«Дууссан гэдэг нь» гарчгийг давтаж болохгүй — юу болсон байхад дууссан гэж үзэхийг бичнэ үү.',
    project: 'Төслөө сонгоно уу.',
    owner: 'Хийх хүнээ сонгоно уу.',
    approver: 'Батлах хүнээ сонгоно уу.',
    due: 'Хугацааны огноо буруу байна.',
    'reason-required': 'Шалтгаанаа бичнэ үү.',
    'not-approver': 'Зөвхөн нэрлэгдсэн батлах хүн батлах эсвэл буцааж чадна.',
    'bad-transition': 'Энэ даалгаврын төлөв өөрчлөгдсөн байна. Жагсаалтыг шинэчиллээ.',
    approved: 'Батлагдсан даалгаврыг засахгүй — эхлээд «Дахин нээх».',
  } as Record<string, string>,
  /** The Тайлан: one person, one week. Read only. */
  report: {
    title: 'Тайлан',
    help: 'Нэг хүний нэг долоо хоног, болсон бүхэн тус бүрдээ: илгээсэн бүр, буцаагдсан бүр шалтгаантай нь, батлагдсан, дахин нээгдсэн, хугацаа хэтэрсэн. Хоёр удаа буцаагдаад батлагдсан ажил нэг батлалт биш: илгээсэн гурван мөр, шалтгаантай буцаагдсан хоёр мөр, батлагдсан нэг мөр. Зөвхөн харах — хэрэгтэй бол сонгоод хуулна.',
    week: 'Долоо хоног',
    person: 'Хүн',
    prev: '← Өмнөх',
    next: 'Дараах →',
    thisWeek: 'Энэ долоо хоног',
    range: '{start} — {end}',
    submitted: 'Илгээсэн',
    approved: 'Батлагдсан',
    sentBack: 'Буцаагдсан',
    reopened: 'Дахин нээсэн',
    overdue: 'Хугацаа хэтэрсэн',
    none: 'Алга.',
    /** One fact: when, and who did it. */
    when: '{date} · {who}',
    /** Why — a send-back's or a reopening's reason, in the same words for both. */
    reason: 'Шалтгаан: {reason}',
  },
  /** The three Telegram messages to the tasks group — nothing else is sent. */
  notify: {
    assigned: '{who}: танд шинэ даалгавар — «{title}». Дууссан гэдэг нь: {done}',
    submitted: '{who}: «{title}» хийгдсэн гэж {by} илгээлээ — таны баталгааг хүлээж байна.',
    sentBack: '{who}: «{title}» буцаагдлаа. Шалтгаан: {reason}',
  },
};
