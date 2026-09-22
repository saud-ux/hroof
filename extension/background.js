// Service worker: يستقبل الاختصار العام من النظام ويوجّهه لتبويب صفحة التحكم.
//
// الاختصارات "global" تعمل حتى والمتصفح في الخلفية (وأنت داخل لعبة أخرى)، وهذا
// الشيء الوحيد الذي تقدر عليه إضافة المتصفح ولا تقدر عليه صفحة الويب وحدها.

// كل أمر → رمز المفتاح الفيزيائي (KeyboardEvent.code) الذي تفهمه صفحة التحكم.
// نستخدم الرموز الفيزيائية نفسها التي يستعملها buzz-host.js حتى تعمل مع أي تخطيط لوحة.
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

chrome.commands.onCommand.addListener(async (command) => {
  const code = CODE_FOR[command];
  if (!code) return;

  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: HOST_PATTERNS });
  } catch (_e) {
    return;
  }

  for (const tab of tabs) {
    if (tab.id == null) continue;
    // لا نوقف بقية التبويبات إذا فشل واحد (تبويب أُغلق للتو مثلًا).
    chrome.tabs.sendMessage(tab.id, { type: 'hroof-shortcut', code }).catch(() => {});
  }
});
