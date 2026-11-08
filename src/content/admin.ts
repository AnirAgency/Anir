/**
 * Every word the admin (/admin/) says, in one place, as site.ts is for the
 * site — so the team proofreads it here. The admin builds its forms from the
 * shape of site.ts; `labels` names each field by its key, `helpAt` and
 * `help` say under each one where it shows, and the length guidance is added
 * from src/scripts/admin-schema.ts > LIMITS. The build stops if a field the
 * admin shows has no label or no help (admin-schema.ts > checkAdmin), so
 * nothing ever shows as its English key.
 *
 * The help is written for someone opening the admin for the second time,
 * not the fiftieth: where the words appear on the site, and what happens if
 * they grow.
 *
 * New Mongolian, all of it — Bat-Enkh to proofread.
 */

export const admin = {
  title: 'Анир — Удирдлага',
  noscript: 'Удирдлагын хэсэг JavaScript шаардана.',
  notConfigured: 'Supabase тохируулагдаагүй байна (src/lib/supabase.json).',

  signIn: {
    title: 'Нэвтрэх',
    email: 'И-мэйл',
    password: 'Нууц үг',
    submit: 'Нэвтрэх',
    working: 'Нэвтэрч байна…',
    failed: 'И-мэйл эсвэл нууц үг буруу байна.',
    notEditor: 'Энэ хаягт засварлах эрх алга. Эрх авахаар эзэмшигчид хандана уу.',
    expired: 'Нэвтрэлт дууссан тул дахин нэвтэрнэ үү.',
  },
  signOut: 'Гарах',

  loading: 'Ачаалж байна…',
  loadFailed: 'Агуулгыг ачаалж чадсангүй. Хуудсаа дахин ачаалж үзнэ үү.',
  notSetUp: 'Мэдээллийн сангийн хүснэгтүүд үүсээгүй байна. Сайтыг хөгжүүлсэн хүнд хандана уу.',

  sectionsTitle: 'Хэсгүүд',
  addProduct: '+ Бүтээгдэхүүн нэмэх',
  newProduct: {
    title: 'Шинэ бүтээгдэхүүн',
    name: 'Нэр',
    id: 'Хаяг (латин жижиг үсэг, тоо, зураас — жишээ нь «ezmath»)',
    create: 'Үүсгэх',
    cancel: 'Болих',
    idInvalid: 'Хаяг зөвхөн латин жижиг үсэг, тоо, зураасаас бүрдэнэ.',
    idTaken: 'Ийм хаягтай бүтээгдэхүүн байна.',
  },
  moveUp: 'Дээш',
  moveDown: 'Доош',
  deleteProduct: 'Бүтээгдэхүүнийг устгах',
  confirmDelete: 'Энэ бүтээгдэхүүнийг устгах уу? «Нийтлэх» дарах хүртэл сайтад хэвээр харагдана.',
  lastProduct: 'Сүүлийн бүтээгдэхүүнийг устгах боломжгүй.',
  heroCardsNote: 'Нүүр хэсгийн бүтээгдэхүүний картуудыг «Эхний дэлгэц»-ээс тусад нь засна.',

  save: 'Хадгалах',
  saving: 'Хадгалж байна…',
  savedShort: 'Хадгалсан',
  saved: 'Хадгаллаа. Сайтад гаргахын тулд «Нийтлэх» дарна уу.',
  unsaved: 'Хадгалаагүй өөрчлөлт байна',
  saveFailed: 'Хадгалж чадсангүй. Нэг минутын дараа дахин оролдоно уу; болохгүй бол «Дэлгэрэнгүй»-г сайтыг хөгжүүлсэн хүнд үзүүлнэ үү.',
  network: 'Холболт тасарлаа. Интернэтээ шалгаад нэг минутын дараа дахин оролдоно уу.',
  /**
   * What the Worker sends the team on its own (worker/watch.ts): flagged
   * enquiries at most once an hour, in exactly these words; and once a day
   * if enquiries flood in.
   */
  notify: {
    digest: 'Шалгах: {n} шинэ',
    flood: 'Өнөөдөр {n} хүсэлт хадгалагдлаа — ердийнхөөс хэт олон, робот байж магадгүй. Удирдлагын «Хүсэлтүүд»-ийг шалгана уу.',
    /** An enquiry waiting in the buffer over an hour (worker/watch.ts > stuck): once, and again a day later if it lasts. */
    stuck: '{n} хүсэлт Supabase-д хадгалагдаж чадалгүй нэг цагаас удаан түр санд хүлээж байна. Хүсэлт алдагдаагүй; Supabase түр зогссон эсэхийг шалгаад сайтыг хөгжүүлсэн хүнд хэлнэ үү.',
  },
  /** Trouble the Worker recorded (worker/alerts.ts), on the status line under the bar. */
  alerts: {
    limiter: 'Хүсэлтийн хязгаарлагч {when}-д ажиллаагүй тул тэр үед хүсэлтийг хязгааргүй хүлээн авсан. Хүсэлт алдагдаагүй; сайтыг хөгжүүлсэн хүнд хэлнэ үү.',
    /** drain-stuck: an enquiry waiting in the buffer over an hour; gone from the line once the buffer empties. */
    drain: 'Хүсэлт {when}-д ч Supabase-д хадгалагдаж чадаагүй, нэг цагаас удаан түр санд хүлээж байна. Хүсэлт алдагдаагүй; «Дэлгэрэнгүй»-г сайтыг хөгжүүлсэн хүнд үзүүлнэ үү.',
    /** A kind of trouble these words do not cover yet (worker/alerts.ts > ALERT_KINDS): shown by its code, never hidden. */
    other: 'Сайт {when}-д «{kind}» гэсэн анхааруулга бүртгэсэн. «Дэлгэрэнгүй»-г сайтыг хөгжүүлсэн хүнд үзүүлнэ үү.',
  },

  /** Someone saved this part after it was opened here: nothing is overwritten, the typing is kept. */
  conflict: 'Өөр хүн энэ хэсгийг хадгалсан байна. Дахин нээж, өөрчлөлтөө оруулна уу.',
  /** Someone no longer an editor, wherever a person is shown — never a bare id. */
  removedPerson: 'Хасагдсан хэрэглэгч',
  reopen: 'Дахин нээх',
  detail: 'Дэлгэрэнгүй',
  keys: 'Ctrl+S — хадгалах · Esc — нээлттэй мөрийг хаах',

  /** A closed tab or a crashed browser does not cost the typing (src/scripts/admin.ts > drafts). */
  draft: {
    found: 'Хадгалаагүй өөрчлөлт байна — сэргээх үү?',
    older: 'Үүний дараа хэн нэгэн энэ хэсгийг хадгалсан. Сэргээвэл та өөрийн өөрчилсөн талбаруудыг л солино.',
    restore: 'Сэргээх',
    discard: 'Устгах',
    dot: 'Хадгалаагүй өөрчлөлттэй',
  },

  publish: {
    button: 'Нийтлэх',
    saveFirst: 'Эхлээд өөрчлөлтөө хадгална уу.',
    otherDrafts: 'Дараах хэсэгт хадгалаагүй өөрчлөлт байна: {views}. Тэдгээрийг оруулахгүйгээр нийтлэх үү?',
    starting: 'Нийтэлж байна…',
    queued: 'Бүтээлт эхэллээ — ихэвчлэн 2–3 минут болно. Дууссанаас хойш хэдэн минутын дотор сайт шинэчлэгдэнэ. Энэ хооронд хуудсаа дахин ачаалах шаардлагагүй — энд мэдэгдэнэ.',
    building: 'Сайтыг бүтээж байна — ихэвчлэн 2–3 минут болно. Дууссанаас хойш хэдэн минутын дотор сайт шинэчлэгдэнэ.',
    done: 'Нийтэллээ. Сайт хэдэн минутын дотор шинэчлэгдэнэ.',
    cancelled: 'Бүтээлт цуцлагдсан тул юу ч өөрчлөгдсөнгүй. Дахин «Нийтлэх» дарна уу.',
    failed: 'Нийтэлж чадсангүй — сайт хуучнаараа байна.',
    unfollowed: 'Бүтээлт эхэллээ — ихэвчлэн 2–3 минут болно. Дууссанаас хойш хэдэн минутын дотор сайт шинэчлэгдэнэ. (Дууссан эсэхийг энд харуулах тохиргоо хийгдээгүй.)',
    /** The build never reported: said, rather than «building» for ever. */
    silent: '15 минутын дотор бүтээлтээс хариу ирсэнгүй. Сайт шинэчлэгдсэн эсэхийг шалгаад, өөрчлөгдөөгүй бол сайтыг хөгжүүлсэн хүнд хандана уу.',
    /** Why a build stopped (worker/publish.ts > CAUSES), and what to do. */
    reasons: {
      content: 'Хадгалсан нэг утгын төрөл буруу байна. Сайтыг хөгжүүлсэн хүнд хандана уу.',
      image: 'Байршуулсан нэг зургийг боловсруулж чадсангүй. Сүүлд оруулсан зургаа өөр файлаар солиод дахин нийтэлнэ үү.',
      claim: 'Түр зураг эсвэл жишээ агуулга бодит сайтад орох гэж байсан тул зогсоов. Сайтыг хөгжүүлсэн хүнд хандана уу.',
      budget: 'Хуудас жингийн хязгаараас хэтэрсэн. Зургийг цөөлөх эсвэл жижиг файлаар солиод дахин нийтэлнэ үү.',
      contrast: 'Өнгөний уншигдах байдлын шалгалт унасан. Сайтыг хөгжүүлсэн хүнд хандана уу.',
      labels: 'Удирдлагын нэг талбар нэргүй үлдсэн. Сайтыг хөгжүүлсэн хүнд хандана уу.',
      alt: 'Нэг зурагт «Зургийн тайлбар» хоосон эсвэл монголоор бичигдээгүй байна. «Дэлгэрэнгүй»-д аль зураг болохыг харж, тайлбарыг нь бичээд дахин нийтэлнэ үү.',
      seo: 'Google-д зориулсан нэг шалгалт унасан: хуудасны гарчиг, тайлбар давхардсан эсвэл дутуу байж магадгүй. «Дэлгэрэнгүй»-г харна уу; ойлгомжгүй бол сайтыг хөгжүүлсэн хүнд хандана уу.',
      video: 'Видео эсвэл түүний зураг хэмжээний хязгаараас хэтэрсэн. Видеог богиносгох эсвэл бага хэмжээтэйгээр дахин экспортлох хэрэгтэй — сайтыг хөгжүүлсэн хүнд хандана уу.',
      other: 'Шалтгааныг тодорхойлж чадсангүй. Сайтыг хөгжүүлсэн хүнд «Дэлгэрэнгүй»-г үзүүлнэ үү.',
    } as Record<string, string>,
    /** When the button itself is refused: no status codes, a cause and a next step. */
    errors: {
      'not-configured': 'Нийтлэх тохиргоо хийгдээгүй байна. Сайтыг хөгжүүлсэн хүнээс нийтлэх холбоосыг (DEPLOY_HOOK_URL) тохируулахыг хүснэ үү.',
      missing: 'Нийтлэх холбоос олдсонгүй — тохиргоо дутуу. Энэ хуулбараас нийтлэх боломжгүй; бодит сайтын удирдлагаас нийтэлнэ үү.',
      'not-editor': 'Энэ хаягт нийтлэх эрх алга. Эзэмшигчээс эрх хүснэ үү.',
      supabase: 'Мэдээллийн сантай холбогдож чадсангүй. Нэг минутын дараа дахин оролдоно уу.',
      hook: 'Бүтээлтийг эхлүүлж чадсангүй. Нэг минутын дараа дахин оролдоно уу.',
      network: 'Холболт тасарлаа. Интернэтээ шалгаад нэг минутын дараа дахин оролдоно уу.',
      other: 'Нийтэлж чадсангүй. Нэг минутын дараа дахин оролдоно уу; болохгүй бол «Дэлгэрэнгүй»-г сайтыг хөгжүүлсэн хүнд үзүүлнэ үү.',
    } as Record<string, string>,
  },

  image: {
    choose: 'Зураг сонгох',
    replace: 'Солих',
    remove: 'Байршуулсныг хасах',
    uploading: 'Байршуулж байна…',
    uploadFailed: 'Зургийг байршуулж чадсангүй. Нэг минутын дараа дахин оролдоно уу.',
    wrongType: 'JPG, PNG, WebP эсвэл AVIF зураг сонгоно уу.',
    uploaded: 'Шинэ зураг — нийтлэхэд гарна',
    current: 'Одоогийн зураг',
    placeholder: 'Түр зураг — бодит зураг алга',
    // New. Bat-Enkh to proofread.
    demo: 'Жишээ — зөвхөн урьдчилан харахад гарна, бодит сайтад хэзээ ч гарахгүй. Бүтээгдэхүүн үнэхээр шинэчлэгдсэн бол энэ хэсгийг хасаад дахин нэмнэ үү.',
    none: 'Зураг алга',
    /** Said before the picker, so nobody learns a limit after a two-minute upload. */
    limits: 'JPG, PNG, WebP эсвэл AVIF · нэг файл {max} хүртэл · сайтад {w} × {h} хэмжээгээр тайрч шахна — ийм хэмжээтэй экспортлоно уу.',
    storage: 'Сангийн багтаамж: {used} / {limit} ашигласан.',
    blocked: 'Нэг файлын хязгаар {max}. Энэ файл {size}.',
    big: 'Энэ файл {size} — 1 GB-ын санд зай эзэлнэ. Зочид үүнийг биш, {w} × {h} болгож шахсан хувилбарыг нь татна.',
    soft: 'Энэ зураг {iw} × {ih} — энэ хэсэг {w} × {h}-ээр харагддаг тул бүдэг харагдана. Дор хаяж {w} × {h} хэмжээтэй зураг оруулна уу.',
    crop: 'Харьцаа нь энэ хэсгээс өөр тул сайтад тааруулахдаа ирмэгээс нь тайрна.',
  },
  list: {
    add: '+ Нэмэх',
    up: '↑',
    down: '↓',
    remove: 'Хасах',
    confirmRemove: 'Хасах уу?',
    ordinal: '№{n}',
    empty: 'Хоосон — дарж бөглөнө үү',
    max: 'Хамгийн ихдээ {n}',
  },
  /** The second line of a process step: which column it is in. */
  rows: {
    both: 'Хоёр баганад',
    client: 'Та',
    studio: 'Бид',
  },
  /** Length guidance (src/scripts/admin-schema.ts > LIMITS): never a block, always the consequence. */
  limits: {
    sentence: '{n} тэмдэгтээс хэтэрвэл {says}.',
    counter: '{len} / {n} тэмдэгт — {says}',
    says: {
      twoLines: 'хоёр мөр болно',
      moreLines: 'нэг мөр нэмэгдэнэ',
      button: 'товч хоёр мөр болно',
      round: 'дугуй товчноос халина',
      google: 'Google-ийн илэрцэд таслагдана',
      phone: 'утсан дээр хоёр мөр болно',
    } as Record<string, string>,
  },

  steps: ['Зүүн талаас засах хэсгээ сонгоно — эсвэл баруун талын хуудсан дээрх бичвэрийг дарна.', 'Засаад «Хадгалах» дарна.', 'Бүгдийг дуусгаад «Нийтлэх» дарна — сайт 2–3 минутад шинэчлэгдэнэ.'],

  groups: {
    home: 'Нүүр хуудас',
    products: 'Бүтээгдэхүүн',
    site: 'Бүх хуудсанд',
  } as Record<string, string>,
  views: {
    inbox: 'Хүсэлтүүд',
    tasks: 'Даалгавар',
    report: 'Тайлан',
    hero: 'Эхний дэлгэц',
    marquee: 'Гүйдэг тууз',
    showreel: 'Бүтээлийн мозайк',
    statement: 'Бүтээгдэхүүний мэдэгдэл',
    process: 'Ажлын явц',
    services: 'Үйлчилгээ',
    contact: 'Холбоо барих',
    pricing: 'Үнэ',
    team: 'Баг',
    productPages: 'Бүх бүтээгдэхүүний хуудасны бичвэр',
    frame: 'Цэс ба зүүн шугам',
    meta: 'Google ба холбоос хуваалцах',
    notFound: 'Олдсонгүй хуудас',
  } as Record<string, string>,
  viewHelp: {
    hero: 'Нүүр хуудасны хамгийн эхэнд харагдах хэсэг: том уриа, товч танилцуулга, бүтээгдэхүүний картууд (4 хүртэл), мөн зүүн шугамд гарах нэр.',
    marquee: 'Эхний дэлгэцийн доор гүйдэг бичвэрийн тууз.',
    showreel: 'Нүүр хуудасны томордог зургийн мозайк. Зураг, видеог хөгжүүлэгч оруулна; энд зөвхөн нэрийг нь засна. Бодит видео орох хүртэл сайтад харагдахгүй.',
    statement: 'Нүүр хуудасны улбар шар торгон дэвсгэртэй өгүүлбэр ба «Бүтээгдэхүүн үзэх» товч, мөн доорх гэрэлт хэсгийн нэр.',
    process: '«Та» ба «Бид» гэсэн хоёр баганатай ажлын алхмууд, дээрээс доош.',
    services: 'Үйлчилгээ бүр: нэр, нэг мөр тайлбар, гурван гол санаа, хоёр зураг.',
    contact: 'Нүүр хуудасны хамгийн доорх хүсэлтийн маягт, и-мэйл, хаяг.',
    pricing: 'Үнийн хүснэгт.',
    team: 'Багийн гишүүд.',
    productPages: 'Бүтээгдэхүүн бүрийн хуудсанд адилхан гарах гарчиг, шошгууд, мөн «Бүтээгдэхүүн» хуудасны гарчиг. Нэг удаа засахад бүгдэд нь өөрчлөгдөнө.',
    frame: 'Хуудас бүрийн дээд талын цэс, компьютерт зүүн талын босоо шугам, Tab товчны «алгасах» холбоос.',
    meta: 'Google болон холбоос хуваалцахад гарах гарчиг, тайлбар. Хуудсан дээр харагдахгүй.',
    notFound: 'Байхгүй хаяг руу орсон зочинд гарах хуудас: гарчиг, тайлбар, нүүр хуудас руу буцах холбоос. Google-д харагдахгүй.',
  } as Record<string, string>,
  off: 'Унтраалттай',
  /** A section the page code does not render: shown, read only, never one toggle from live. */
  offHelp: 'Энэ хэсэг хуудасны кодонд унтраалттай тул сайтад харагдахгүй, энд засах боломжгүй — зөвхөн харах. Асаахыг сайтыг хөгжүүлсэн хүнээс хүснэ үү.',
  count: '{n} ширхэг',

  page: 'Хуудас',
  noPageAt: 'Хуудсан дээр харагдахгүй — хайлтын систем, дэлгэц уншигчид зориулсан',
  preview: {
    show: 'Урьдчилан харах',
    hide: 'Урьдчилан харахыг хаах',
    desktop: 'Компьютер',
    phone: 'Утас',
    note: 'Хадгалаагүй өөрчлөлт энд шууд харагдана. Талбар дээр очиход хуудсан дээр хаана байгаа нь улбар шараар тодорно; хуудсан дээрх бичвэр, зургийг дарвал түүний талбар нээгдэнэ.',
    noPage: 'Энэ бүтээгдэхүүний хуудас нийтэлсний дараа үүснэ.',
    notFound: 'Энэ талбарыг хуудсан дээрээс олсонгүй — харагддаггүй эсвэл одоо нуугдсан байж болно.',
    noField: 'Үүнд тохирох талбар олдсонгүй — энэ бичвэрийг хөгжүүлэгч засна.',
    inbox: 'Хүсэлтүүд хуудсан дээр харагдахгүй.',
    tasks: 'Даалгавар, тайлан сайтын хуудсан дээр харагдахгүй — зөвхөн энд.',
  },
  productHelp: 'Энэ бүтээгдэхүүний өөрийн хуудас. Нийтэлсний дараа «Бүтээгдэхүүн» хуудсанд картаар гарна.',

  /**
   * The team's task list (worker/tasks.ts, src/scripts/admin-tasks.ts). Codes
   * stored, these words shown — src/lib/task-codes.ts names the codes, and
   * the admin page's build fails if one has no words here (checkAdmin).
   */
  tasks: {
    group: 'Ажил',
    help: 'Багийн ажил: хэн юуг хийх, хэзээ гэхэд, хэн батлах. Анх нээхэд — танд оноосон ажил, таны баталгааг хүлээж буй ажил. Бусад нь шүүлтүүрээр.',
    /** The badge's two numbers, read aloud. */
    badgeMine: 'Танд оноосон, дуусаагүй: {n}',
    badgeApprove: 'Таны баталгааг хүлээж буй: {n}',
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
      help: 'Нэг хүний нэг долоо хоног, болсон бүхэн тус бүрдээ: илгээсэн бүр, буцаагдсан бүр шалтгаантай нь, батлагдсан, дахин нээгдсэн, хугацаа хэтэрсэн. Хоёр удаа буцаагдаад батлагдсан ажил гурван мөр болж харагдана. Зөвхөн харах — хэрэгтэй бол сонгоод хуулна.',
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
  },

  /** The enquiries inbox (worker/inbox.ts). Opening one never marks it read: that is a click. */
  inbox: {
    title: 'Хүсэлтүүд',
    help: 'Сайтын маягтаар ирсэн хүсэлтүүд, шинэ нь дээрээ. Нээхэд «уншсан» болохгүй — тэмдэглэхдээ товч дарна, ингэснээр санамсаргүй нээсэн хүсэлт дараагийн хүнээс нуугдахгүй. Устгах боломжгүй; дууссаныг «Хаах». Ирсэн бүхнийг хадгалдаг тул робот илгээсэн зүйлс ч ирнэ — ихэвчлэн «Шалгах»-д тусдаа очдог.',
    /** What the inbox lists by: «Шинэ» is new and unflagged — the badge counts only those. */
    filters: {
      new: 'Шинэ',
      flagged: 'Шалгах',
      read: 'Уншсан',
      replied: 'Хариулсан',
      closed: 'Хаасан',
    } as Record<string, string>,
    statuses: {
      new: 'Шинэ',
      read: 'Уншсан',
      replied: 'Хариулсан',
      closed: 'Хаасан',
    } as Record<string, string>,
    mark: {
      new: 'Шинэ болгох',
      read: 'Уншсан гэж тэмдэглэх',
      replied: 'Хариулсан гэж тэмдэглэх',
      closed: 'Хаах',
    } as Record<string, string>,
    empty: 'Энэ төлөвт хүсэлт алга.',
    noMessage: 'Мессеж бичээгүй',
    /** What the Worker stored as sent but could not match to the form (worker/enquiry.ts). */
    flags: {
      title: 'Шалгах',
      choice: '{legend}: «{value}» — маягтын сонголтод байхгүй, ирснээр нь хадгалсан',
      name: 'Нэр бичээгүй',
      contact: 'Холбоо барих мэдээлэл и-мэйл эсвэл утасны дугаар шиг харагдахгүй байна — бичсэнээр нь хадгалсан',
      body: 'Маягтаар бус өөр хэлбэрээр илгээсэн — ирсэн бичвэрийг нь мессеж хэсэгт хадгалсан',
      /** A value past its column's length (src/lib/enquiry-limits.ts): kept to the limit, the rest cut. */
      cut: '{field}: {length} тэмдэгт ирсэн нь хязгаараас урт тул эхний {max} тэмдэгтийг хадгалж, үлдсэнийг хассан',
      /** The browser's own description of itself, sent with every request — {field} in «cut» when it is the one cut. */
      userAgent: 'Хөтчийн мэдээлэл (User-Agent)',
    },
    changed: '{status} — {who}, {when}',
    refresh: 'Шинэчлэх',
    loading: 'Ачаалж байна…',
    failed: 'Хүсэлтүүдийг ачаалж чадсангүй. Нэг минутын дараа «Шинэчлэх» дарна уу.',
    notConfigured: 'Хүсэлтүүдийг зөвхөн бодит сайтын удирдлагаас харна — энэ хуулбарт мэдээллийн сан холбогдоогүй.',
    missing: 'Хүсэлтийн холбоос олдсонгүй — энэ хуулбар дээр ажиллахгүй. Бодит сайтын удирдлагаас үзнэ үү.',
  },

  /**
   * Under every field: where it shows on the site, by where it is in the
   * content. `*` is any item or key; the most particular match wins, then
   * `help` by the field's name. The length guidance is added after it.
   */
  helpAt: {
    // Google and sharing
    'meta.title': 'Хөтчийн табын нэр, Google-ийн илэрцийн цэнхэр гарчиг. Хуудсан дээр харагдахгүй.',
    'meta.description': 'Google-ийн илэрцэд, мөн холбоос хуваалцахад гарчгийн доор гарах тайлбар. Хуудсан дээр харагдахгүй.',
    'meta.locality': 'Хайлтын системд зориулсан хотын нэр. Хуудсан дээр харагдахгүй.',
    'meta.country': 'Хайлтын системд зориулсан улсын нэр. Хуудсан дээр харагдахгүй.',
    'meta.founded': 'Хайлтын системд зориулсан байгуулагдсан он, дөрвөн оронтой. Хуудсан дээр харагдахгүй.',

    // The frame of every page
    'nav.wordmark': 'Хуудас бүрийн зүүн дээд буланд, цэсний эхэнд гарах лого бичвэр.',
    'nav.links': 'Хуудас бүрийн дээд талын цэсний холбоосууд, зүүнээс баруун тийш.',
    'nav.links.*.label': 'Цэсэнд харагдах бичвэр.',
    'nav.links.*.href': 'Дарахад очих газар: /products/ гэх мэт хуудас, эсвэл #contact гэх мэт нүүр хуудасны хэсэг. Буруу бичвэл холбоос ажиллахгүй.',
    'nav.links.*.accent': 'Чагтлавал энэ холбоос улбар шараар онцлогдоно — ихэвчлэн «Холбоо +». Нэгээс олныг онцлохгүй.',
    'chrome.railTick': 'Компьютерт зүүн талын босоо шугамын дээд үзүүрт гарах жижиг тэмдэг («УБ»). Хоёр гурван үсэг.',
    'chrome.skipToContent': 'Tab товч анх дарахад зүүн дээд буланд гарч ирэх холбоос — гараар хөтөлдөг хүнд.',
    'chrome.navLabel': 'Харагдахгүй — дэлгэц уншигч цэсийг ингэж нэрлэнэ. Нэг хоёр үг.',
    'chrome.railLabel': 'Харагдахгүй — дэлгэц уншигч зүүн шугамыг ингэж нэрлэнэ. Нэг хоёр үг.',

    // Every section's head
    '*.intro.label': 'Энэ хэсэгт байхад компьютерт зүүн шугамын доод хэсэгт босоогоор гарах нэр. Нэг хоёр үг.',
    '*.intro.eyebrow': 'Хэсгийн том гарчгийн дээрх жижиг шошго.',
    '*.intro.title': 'Хэсгийн том гарчиг.',

    // The hero
    'chrome.heroLabel': 'Эхний дэлгэцэд байхад компьютерт зүүн шугамын доод хэсэгт босоогоор гарах нэр. Нэг хоёр үг.',
    'hero.tagline.line': 'Нүүр хуудасны хамгийн том гарчгийн эхний хэсэг.',
    'hero.tagline.lineItalic': 'Том гарчгийн доорх налуу мөр.',
    'hero.lede': 'Том гарчгийн доорх танилцуулга догол мөр.',
    'hero.products': 'Эхний дэлгэцийн доод талын бүтээгдэхүүний картууд, нэг мөрөнд тэнцүү хуваагдана. Шинэ бүтээгдэхүүн нэмэхэд энд автоматаар нэмэгдэхгүй — картыг энд тусад нь нэмнэ.',
    'hero.products.*.eyebrow': 'Картын дээд талын жижиг шошго.',
    'hero.products.*.name': 'Картын том нэр.',
    'hero.products.*.tagline': 'Картын нэрийн доорх мөр.',
    'hero.products.*.cta': 'Картын доод талын «Үзэх +» бичвэр. Холбоосгүй картад гарахгүй.',
    'hero.products.*.href': 'Карт дээр дарахад очих хуудас, ихэвчлэн /products/<хаяг>/. Хоосон бол карт дарагдахгүй.',

    'marquee.text': 'Эхний дэлгэцийн доор зогсолтгүй гүйдэг туузан дээр давтагдана. Урт байж болно — тууз тасралтгүй гүйнэ.',
    'showreel.label': 'Мозайк хэсэгт байхад зүүн шугамд, мөн дэлгэц уншигчид гарах нэр. Мозайк бодит видео орох хүртэл сайтад гарахгүй.',

    // The products statement
    'products.statement.eyebrow': 'Торгон дэвсгэртэй хэсгийн өгүүлбэрийн дээрх жижиг шошго.',
    'products.statement.text': 'Нүүр хуудасны улбар шар торгон дэвсгэр дээр, гүйлгэх тусам үг үгээр гэрэлтэх том өгүүлбэр.',
    'products.statement.cta': 'Өгүүлбэрийн доорх, «Бүтээгдэхүүн» хуудас руу хөтлөх товч.',
    'products.statement.backdrop': 'Өгүүлбэрийн ард урсах улбар шар торгоны зураг, бараан дэвсгэртэй.',
    'products.intro.label': 'Торгон хэсгийн доорх гэрэлт хэсэгт байхад зүүн шугамд гарах нэр. Нэг хоёр үг.',

    // The process
    'process.sides.client': 'Ажлын явц хэсгийн зүүн баганын нэр — захиалагчийн хийх алхмууд.',
    'process.sides.studio': 'Ажлын явц хэсгийн баруун баганын нэр — Анирын хийх алхмууд.',
    'process.events': 'Ажлын алхмууд, дээрээс доош, гинжин тойргуудын хажууд. Алхам бүр зүүн, баруун, эсвэл хоёр баганад зэрэг байна.',
    'process.events.*.*.title': 'Алхмын нэр, тойргийн хажууд.',
    'process.events.*.*.description': 'Алхмын нэрийн доорх тайлбар.',

    // The services
    'services.items': 'Нүүр хуудасны үйлчилгээний мөрүүд, дээрээс доош. Мөр дарахад нээгдэж, доорх зүйлс нь харагдана.',
    'services.items.*.index': 'Мөрийн өмнөх дугаар («01»). Бичсэнээр нь гарна.',
    'services.items.*.name': 'Үйлчилгээний том нэр; мөрийг нээхэд улбар шар тууз дээр гүйнэ.',
    'services.items.*.line': 'Мөрийг нээхэд нэрийн доор гарах нэг өгүүлбэр.',
    'services.items.*.points': 'Мөрийг нээхэд гарах гурван гол санаа.',
    'services.items.*.points.*': 'Нээсэн мөр доторх нэг гол санаа.',
    'services.items.*.images': 'Мөрийг нээхэд гарах хоёр зураг.',
    'services.items.*.images.*': 'Нээсэн мөр доторх зураг.',

    // The enquiry form
    'contact.intro.title': 'Хүсэлтийн хэсгийн том гарчиг; бүтээгдэхүүний хуудас бүрийн төгсгөлд ч давтагдана.',
    'contact.email': 'Хүсэлтийн хэсэгт том улбар шараар гарах и-мэйл; дарахад и-мэйл бичих цонх нээгдэнэ.',
    'contact.address': 'Хүсэлтийн хэсэгт и-мэйлийн доор мөр мөрөөр гарах хаяг.',
    'contact.address.*': 'Хаягийн нэг мөр.',
    'contact.form.groups': 'Маягтын сонголтын гурван бүлэг: юу хийлгэх, төсөв, хугацаа. Бичвэрийг нь засна; ард нь байгаа кодыг өөрчилдөггүй.',
    'contact.form.groups.*.legend': 'Сонголтуудын дээрх асуулт («Юу вэ», «Төсөв»).',
    'contact.form.groups.*.options': 'Тухайн асуултын сонголтын товчнууд.',
    'contact.form.groups.*.options.*.label': 'Сонголтын товчин дээрх бичвэр.',
    'contact.form.fields.*.label': 'Маягтын бичих талбарын дээрх нэр.',
    'contact.form.fields.*.placeholder': 'Талбар хоосон үед дотор нь бүдэг харагдах жишээ.',
    'contact.form.submit': 'Маягтын илгээх товч.',
    'contact.form.sending': 'Илгээж байх хооронд товчин дээр түр гарна.',
    'contact.form.messages.success': 'Хүсэлт амжилттай очсоны дараа товчны доор гарна.',
    'contact.form.messages.error': 'Хүсэлтийг хадгалж чадаагүй ховор үед товчны доор гарна.',
    'contact.form.messages.invalid': 'Талбар дутуу эсвэл буруу бөглөсөн үед товчны доор гарна.',
    'contact.form.messages.tooMany': 'Нэг хүн цагт 5-аас олон удаа илгээвэл товчны доор гарна.',

    // The words every product page shares
    'products.pages.title': '«Бүтээгдэхүүн» хуудасны хамгийн том нэр.',
    'products.pages.headline': '«Бүтээгдэхүүн» хуудасны нэрийн доор үг үгээр гэрэлтэх өгүүлбэр.',
    'products.pages.intro': '«Бүтээгдэхүүн» хуудасны гэрэлтэх өгүүлбэрийн доорх жижиг мөр.',
    'products.pages.open': '«Бүтээгдэхүүн» хуудасны карт бүрийн «Үзэх +» бичвэр.',
    'products.pages.back': 'Бүтээгдэхүүний хуудасны дээд талд «Бүх бүтээгдэхүүн» рүү буцах холбоос.',
    'products.pages.visit': 'Бүтээгдэхүүн өөрийн сайттай бол танилцуулгын доор гарах «Сайтыг үзэх +» холбоос.',
    'products.pages.next': 'Бүтээгдэхүүний хуудасны төгсгөлд, дараагийн бүтээгдэхүүний бүтэн дэлгэцийн зураг дээрх том бичвэр.',
    'products.pages.about': 'Хуудасны төгсгөлийн дугуй улбар шар товчин дээрх бичвэр.',
    'products.pages.impressions': '«Сэтгэгдэл» хэсэгт байхад зүүн шугамд гарах нэр.',
    'products.pages.overview': '«Ерөнхий сэтгэгдэл» хэсгийн, дэлгэцийн голд гарах гурван мөр гарчиг.',
    'products.pages.overview.*': 'Гарчгийн нэг мөр.',
    'products.pages.compare.title': 'Хуучин ба шинэ сайтыг шугамаар харьцуулах хэсгийн гарчиг.',
    'products.pages.compare.note': 'Харьцуулах хэсгийн гарчгийн доорх тайлбар мөр.',
    'products.pages.compare.before': 'Харьцуулах зургийн зүүн дээд талын шошго.',
    'products.pages.compare.after': 'Харьцуулах зургийн баруун дээд талын шошго.',
    'products.pages.fresh.title': 'Шинээр бүтээсэн бүтээгдэхүүний нүүр хуудасны зургийн дээрх гарчиг.',
    'products.pages.fresh.note': 'Тэр гарчгийн доорх тайлбар мөр.',
    'products.pages.responsive.label': 'Утасны зургуудын хэсэгт байхад зүүн шугамд гарах нэр.',
    'products.pages.responsive.title': 'Шат шиг байрласан утасны зургуудын дээрх хоёр мөр гарчиг.',
    'products.pages.responsive.title.*': 'Гарчгийн нэг мөр.',
    'products.pages.testimonial.label': 'Хэрэглэгчийн сэтгэгдэл хэсгийн нэр — зүүн шугамд, дэлгэц уншигчид.',
    'products.pages.testimonial.stand.name': 'Түр сэтгэгдлийн нэр. Зөвхөн урьдчилан харахад гарна, бодит сайтад хэзээ ч гарахгүй.',
    'products.pages.testimonial.stand.role': 'Түр сэтгэгдлийн албан тушаал. Зөвхөн урьдчилан харахад гарна.',
    'products.pages.testimonial.stand.quote': 'Түр ишлэл, юу орохыг тайлбарласан. Зөвхөн урьдчилан харахад гарна.',
    'products.pages.testimonial.stand.quote.*': 'Түр ишлэлийн нэг хэсэг. Зөвхөн урьдчилан харахад гарна.',
    'products.pages.testimonial.stand.portrait': 'Түр хөргийн байр. Зөвхөн урьдчилан харахад гарна.',
    'products.specLabels.*': 'Бүтээгдэхүүний хуудасны танилцуулгын доорх баганын дээрх жижиг шошго.',

    // One product's page
    'product.seo.title': 'Энэ бүтээгдэхүүний хуудасны хөтчийн табын нэр, Google-ийн илэрцийн цэнхэр гарчиг. Хуудсан дээр харагдахгүй.',
    'product.seo.description': 'Энэ бүтээгдэхүүний хуудас Google-ийн илэрцэд, мөн холбоос хуваалцахад гарчгийн доор гарах тайлбар. Хуудсан дээр харагдахгүй.',
    'products.pages.seo.title': '«Бүтээгдэхүүн» хуудасны хөтчийн табын нэр, Google-ийн илэрцийн цэнхэр гарчиг. Хуудсан дээр харагдахгүй.',
    'products.pages.seo.description': '«Бүтээгдэхүүн» хуудас Google-ийн илэрцэд, мөн холбоос хуваалцахад гарчгийн доор гарах тайлбар. Хуудсан дээр харагдахгүй.',
    'chrome.notFound.title': 'Байхгүй хаяг руу ороход хөтчийн таб дээр гарах нэр.',
    'chrome.notFound.heading': 'Байхгүй хаяг руу ороход гарах хуудасны том гарчиг.',
    'chrome.notFound.text': 'Тэр гарчгийн доорх тайлбар мөр.',
    'chrome.notFound.home': 'Нүүр хуудас руу буцах холбоосны бичвэр.',
    'product.name': 'Бүтээгдэхүүний хуудасны хамгийн том гарчиг; «Бүтээгдэхүүн» хуудасны картад ч гарна.',
    'product.tagline': 'Хуудасны гарчгийн хажууд саарал өнгөөр гарах уриа.',
    'product.description': 'Танилцуулгад үг үгээр гэрэлтэх тайлбар; «Бүтээгдэхүүн» хуудасны картад ч гарна.',
    'product.spec.role': 'Танилцуулгын доор «Үүрэг» баганад: Анир юу хийсэн.',
    'product.spec.tech': 'Танилцуулгын доор «Технологи» баганад.',
    'product.spec.year': 'Танилцуулгын доор «Он» баганад.',
    'product.href': 'Бүтээгдэхүүний нийтийн сайтын хаяг (https://…). Байвал танилцуулгын доор «Сайтыг үзэх +» холбоос гарна.',
    'product.shot': 'Хуудасны хамгийн эхэнд бүтэн дэлгэцээр, «Бүтээгдэхүүн» хуудасны картад ч гарах гол зураг.',
    'product.gallery.screens': 'Хуудасны эхний зургийн хананд орох компьютерийн дэлгэцийн зургууд.',
    'product.gallery.screens.*': 'Зургийн хананд орох компьютерийн дэлгэцийн зураг.',
    'product.gallery.mobile': 'Хуудасны эхний зургийн хананд орох утасны дэлгэцийн зургууд.',
    'product.gallery.mobile.*': 'Зургийн хананд орох утасны дэлгэцийн зураг.',
    'product.gallery.more': '«Ерөнхий сэтгэгдэл» хэсэгт нэг нэгээр нь томоор, мөн зургийн хананд гарах зургууд.',
    'product.gallery.more.*': '«Ерөнхий сэтгэгдэл» хэсэгт томоор гарах зураг.',
    'product.feature': 'Танилцуулгын дараах бүтэн дэлгэцийн том зураг.',
    'product.impressions.text': '«Сэтгэгдэл» хэсгийн том догол мөр — бүтээгдэхүүн юунд зориулагдсан тухай.',
    'product.impressions.images': '«Сэтгэгдэл» хэсгийн хоёр зураг: өргөн нь дэлгэцийн доод талд, босоо нь түүн дээр давхцана.',
    'product.impressions.images.*': '«Сэтгэгдэл» хэсгийн зураг.',
    'product.front.before': 'Хуучин сайтын нүүр хуудас — харьцуулах шугамын зүүн тал. Зөвхөн үнэхээр шинэчилсэн бүтээгдэхүүнд.',
    'product.front.after': 'Шинэ сайтын нүүр хуудас — харьцуулах шугамын баруун тал, эсвэл «Эхнээс нь шинээр» хэсгийн зураг.',
    'product.responsive': 'Гар утсан дээрх бүтэн хуудсуудын зургууд — шат шиг тав. Босоо урт зураг оруулна.',
    'product.responsive.*': 'Утсан дээрх нэг бүтэн хуудасны босоо зураг.',
    'product.testimonial.name': 'Сэтгэгдэл бичсэн хүний нэр, хөргийн доор.',
    'product.testimonial.role': 'Нэрийн доорх албан тушаал, байгууллага.',
    'product.testimonial.quote': 'Ишлэл хоёр хэсэгтэй: эхнийх нь зүүн талд, хоёр дахь нь баруун доош шилжиж төгсгөнө. Зөвшөөрөлтэй бодит үг л.',
    'product.testimonial.quote.0': 'Ишлэлийн эхний хэсэг, зүүн талд.',
    'product.testimonial.quote.1': 'Ишлэлийн төгсгөл, баруун доош шилжинэ.',
    'product.testimonial.portrait': 'Нэрийн дээрх дугуй хөрөг зураг.',

    // Switched off today: said once, at the top of the section.
    'pricing.*': 'Үнийн хүснэгтэд.',
    'team.*': 'Багийн хэсэгт.',
  } as Record<string, string>,

  /** Where `helpAt` has nothing more particular: by the field's name. */
  help: {
    alt: 'Зургийг харж чадахгүй хүнд дэлгэц уншигч уншиж өгөх, Google-д ойлгуулах тайлбар. Зурагт юу байгааг нэг өгүүлбэрээр.',
  } as Record<string, string>,

  optional: {
    add: '+ Нэмэх',
    remove: 'Хасах',
  },

  /**
   * By field name. The last few name what the admin hides — read by screen
   * readers, or on no page — so the proofreading list (npm run copy:export)
   * can say where they are too.
   */
  labels: {
    seo: 'Google ба холбоос хуваалцахад',
    notFound: 'Олдсонгүй хуудас',
    heading: 'Том гарчиг',
    home: 'Нүүр хуудас руу буцах холбоос',
    about: 'Товчны бичвэр',
    accent: 'Онцлох (улбар шар)',
    address: 'Хаяг',
    after: 'Шинэ хувилбар',
    alt: 'Зургийн тайлбар',
    back: 'Буцах холбоос',
    backdrop: 'Арын зураг (бараан)',
    before: 'Хуучин хувилбар',
    both: 'Хоёр баганад',
    client: 'Та (захиалагч)',
    compare: 'Хуучин ба шинэ',
    contact: 'Холбоо барих талбар',
    country: 'Улс',
    cta: 'Товчны бичвэр',
    description: 'Тайлбар',
    email: 'И-мэйл',
    error: 'Алдааны мессеж',
    events: 'Алхмууд',
    eyebrow: 'Жижиг гарчиг',
    feature: 'Бүтэн дэлгэцийн том зураг',
    fields: 'Талбарууд',
    form: 'Маягт',
    founded: 'Байгуулагдсан он',
    fresh: 'Шинээр бүтээсэн',
    front: 'Хуучин ба шинэ нүүр хуудас',
    gallery: 'Зургийн хананы зургууд',
    groups: 'Сонголтын бүлгүүд',
    headline: 'Том гарчиг',
    heroLabel: 'Зүүн шугамын нэр',
    href: 'Холбоос',
    images: 'Зургууд',
    impressions: 'Сэтгэгдэл',
    index: 'Дугаар',
    intro: 'Гарчиг',
    invalid: 'Буруу бөглөсөн үеийн мессеж',
    items: 'Жагсаалт',
    label: 'Шошго',
    lede: 'Оршил',
    legend: 'Асуулт',
    line: 'Мөр',
    lineItalic: 'Налуу мөр',
    links: 'Холбоосууд',
    locality: 'Хот',
    message: 'Мессеж',
    messages: 'Мессежүүд',
    mobile: 'Утасны дэлгэцүүд',
    more: 'Ерөнхий сэтгэгдлийн зургууд',
    name: 'Нэр',
    navLabel: 'Цэсний нэр (дэлгэц уншигчид)',
    next: 'Дараагийн бүтээгдэхүүн',
    note: 'Тайлбар мөр',
    open: 'Нээх холбоосын бичвэр',
    options: 'Сонголтууд',
    overview: 'Ерөнхий сэтгэгдлийн гарчиг',
    pages: 'Хуудаснууд',
    placeholder: 'Жишээ бичвэр',
    points: 'Гол санаанууд',
    portrait: 'Хөрөг',
    price: 'Үнэ',
    products: 'Бүтээгдэхүүний картууд',
    quote: 'Ишлэл',
    railLabel: 'Явцын шугамын нэр (дэлгэц уншигчид)',
    railTick: 'Зүүн шугамын тэмдэг',
    responsive: 'Утсан дээрх хуудсууд',
    role: 'Албан тушаал',
    rows: 'Мөрүүд',
    screens: 'Компьютерийн дэлгэцүүд',
    sending: 'Илгээж байх үеийн бичвэр',
    shot: 'Гол зураг',
    sides: 'Баганын нэр',
    skipToContent: 'Үндсэн хэсэг рүү алгасах',
    spec: 'Үүрэг, технологи, он',
    specLabels: 'Мэдээллийн шошго',
    stand: 'Түр сэтгэгдэл (зөвхөн урьдчилан харахад)',
    statement: 'Мэдэгдэл',
    studio: 'Бид (Анир)',
    submit: 'Илгээх товч',
    success: 'Амжилттай үеийн мессеж',
    tagline: 'Уриа',
    tech: 'Технологи',
    testimonial: 'Хэрэглэгчийн сэтгэгдэл',
    text: 'Бичвэр',
    title: 'Гарчиг',
    tooMany: 'Хэт олон хүсэлтийн мессеж',
    unit: 'Нэгж',
    visit: 'Сайт үзэх холбоос',
    wordmark: 'Лого бичвэр',
    year: 'Он',
    // Hidden in the admin; named for the proofreading list.
    control: 'Харьцуулах шугамын нэр (дэлгэц уншигчид)',
    controls: 'Хуучин слайдшоуны товчнууд',
    honeypot: 'Роботын урхи талбар (харагдахгүй)',
    logoAlt: 'Логоны тайлбар (дэлгэц уншигчид)',
    pause: 'Зогсоох',
    play: 'Үргэлжлүүлэх',
    slide: 'Слайд',
    video: 'Видео',
  } as Record<string, string>,
};
