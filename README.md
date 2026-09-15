# حروف - عرض الأسئلة

تطبيق ويب بسيط لعرض الأسئلة مباشرة **بدون الحاجة للانضمام إلى فريق**.
مبني بـ

Node.js + Express

وواجهة عربية

RTL

بسيطة.

---

## التشغيل محلياً

```bash
npm install
npm start
```

ثم افتح

http://localhost:3000

---

## البنية

```
├── server.js            # خادم Express
├── package.json
├── render.yaml          # إعدادات النشر على Render
├── data/
│   └── questions.json   # بيانات الأسئلة والإجابات
└── public/
    ├── index.html       # الصفحة الرئيسية
    ├── style.css        # التنسيقات
    └── app.js           # منطق العرض
```

---

## إضافة أو تعديل الأسئلة

عدّل الملف

`data/questions.json`

بنية الملف:

```json
{
  "categories": [
    {
      "name": "اسم الفئة",
      "questions": [
        { "q": "نص السؤال", "a": "الإجابة" }
      ]
    }
  ]
}
```

---

## النشر على Render

### الطريقة الأولى: Blueprint (تلقائي)

الملف

`render.yaml`

موجود في المستودع، فقط:

1. ادخل على
   https://dashboard.render.com/select-repo?type=blueprint
2. اختر مستودع
   `saud-ux/hroof`
3. اضغط
   Apply

سيقوم

Render

بقراءة

`render.yaml`

وإنشاء الخدمة تلقائياً.

### الطريقة الثانية: يدوياً

1. ادخل
   https://dashboard.render.com
2. اضغط
   **New → Web Service**
3. اختر المستودع
   `saud-ux/hroof`
4. الإعدادات:
   - **Environment**:
     Node
   - **Build Command**:
     `npm install`
   - **Start Command**:
     `npm start`
   - **Branch**:
     `main`
5. اضغط
   **Create Web Service**

بعد اكتمال النشر ستحصل على رابط مثل:

`https://hroof.onrender.com`

---

## الميزات

- عرض الأسئلة مقسمة على فئات
- عرض/إخفاء الإجابة لكل سؤال
- زر لإظهار/إخفاء كل الإجابات دفعة واحدة
- تصميم متجاوب يدعم الشاشات الصغيرة
- دعم الوضع الليلي تلقائياً
