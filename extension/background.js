// Service worker: يستقبل الاختصار العام من النظام ويوجّهه لتبويب صفحة التحكم.
//
// الاختصارات "global" تعمل حتى والمتصفح في الخلفية (وأنت داخل لعبة أخرى)، وهذا
// الشيء الوحيد الذي تقدر عليه إضافة المتصفح ولا تقدر عليه صفحة الويب وحدها.

// كل أمر → رمز المفتاح الفيزيائي (KeyboardEvent.code) الذي يفهمه سكربت المحتوى.
const CODE_FOR = {
  'arm': 'Space',
  'disarm': 'Escape',
  'next': 'KeyN',
  'award': 'KeyA',
  'toggle-answer': 'KeyH',
  'difficulty-1': 'Digit1',
  'difficulty-2': 'Digit2',
  'difficulty-3': 'Digit3',
  'timer-5': 'Digit5',
  'timer-10': 'Digit0',
};

// مسارات صفحة التحكم كما يقدّمها السيرفر: /buzz/host و /bzhost و /buzz-host.html
// النجمة في المضيف تعني أي عنوان أو منفذ (IP محلي، أو نفق cloudflared، أو استضافة).
const HOST_PATTERNS = ['*://*/buzz/host', '*://*/bzhost', '*://*/buzz-host.html'];

// مؤشّر تشخيصي على أيقونة الإضافة: يبيّن أن الاختصار وصل فعلًا.
//   ✓ (أخضر)  = الاختصار وصل ووُجدت صفحة تحكم وأُرسل الأمر.
//   ✗ (أحمر)  = الاختصار وصل لكن لا توجد صفحة تحكم مفتوحة (افتح /buzz/host).
//   (لا شيء) = الاختصار لم يصل أصلًا → المفتاح غير معيّن أو نطاقه ليس Global.
function flashBadge(text, color) {
  try {
    chrome.action.setBadgeBackgroundColor({ color });
    chrome.action.setBadgeText({ text });
    setTimeout(() => { try { chrome.action.setBadgeText({ text: '' }); } catch (_e) {} }, 1500);
  } catch (_e) { /* action غير متاح — تجاهل */ }
}

chrome.commands.onCommand.addListener(async (command) => {
  const code = CODE_FOR[command];
  if (!code) return;

  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: HOST_PATTERNS });
  } catch (_e) {
    flashBadge('ERR', '#c8542a');
    return;
  }

  if (!tabs.length) {
    flashBadge('✗', '#c8542a');
    return;
  }

  for (const tab of tabs) {
    if (tab.id == null) continue;
    // لا نوقف بقية التبويبات إذا فشل واحد (تبويب أُغلق للتو مثلًا).
    chrome.tabs.sendMessage(tab.id, { type: 'hroof-shortcut', code }).catch(() => {});
  }
  flashBadge('✓', '#1a9d55');
});
