# كشف الدخيل 🕵️

لعبة اجتماعية أونلاين للكشف عن اللاعب الذي حصل على سؤال مختلف.  
A social deduction party game where players try to find the impostor who got a different question.

## كيف تلعب؟ / How to Play?

1. **يدخل اللاعبون** إلى نفس الغرفة عن طريق كود مكون من 4 أحرف  
2. **صاحب الغرفة يضغط "ابدأ"** لتوزيع الأسئلة  
3. **معظم اللاعبين** يحصلون على السؤال A، **ولاعب واحد (أو اثنان)** يحصلون على السؤال B (الدخيل)  
4. **مرحلة النقاش** - الجميع يتحدثون في الدردشة ويكتشفون من هو الدخيل  
5. **مرحلة التصويت** - يصوت اللاعبون على من يعتقدون أنه الدخيل  
6. **كشف النتائج** - يتم معرفة إذا نجح الدخيل في التخفي أم تم اكتشافه

---

1. **Players join** a room using a 4-character code  
2. **Host starts** the game to distribute questions  
3. **Most players** get Question A, **1-2 players** get Question B (the impostor)  
4. **Discussion phase** - everyone chats and tries to find the impostor  
5. **Voting phase** - players vote on who they think is the impostor  
6. **Results** - reveal if the impostor was caught or not

## التشغيل المحلي / Local Setup

```bash
# 1. ثبت Node.js من https://nodejs.org (اختر LTS)
# 2. حمل المشروع
git clone https://github.com/<اسم-مستخدمك>/kashf-al-dakheel.git
cd kashf-al-dakheel

# 3. ثبت الاعتماديات
npm install

# 4. شغل الخادم
npm start

# 5. افتح المتصفح على
http://localhost:3000
```

### اللعب مع الأصدقاء عبر الإنترنت

#### الخيار 1: Render (مجاني، موصى به)
1. ارفع المشروع على GitHub
2. افتح [render.com](https://render.com) وسجل حساب (Connect with GitHub)
3. اضغط "New +" ← "Web Service"
4. اختر المستودع
5. اترك الإعدادات كالتالي:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. اضغط "Create Web Service"
7. بعد دقيقة، راح تحصل على رابط مثل `https://kashf-al-dakheel.onrender.com`
8. أرسل الرابط لأصدقائك وابدأوا اللعب!

#### الخيار 2: Railway (مجاني)
1. ارفع المشروع على GitHub
2. افتح [railway.app](https://railway.app) وسجل
3. اضغط "New Project" ← "Deploy from GitHub repo"
4. اختر المستودع
5. راح يتنشر تلقائياً ويعطيك رابط

#### الخيار 3: Render + GitHub (شرح بالصور)

```
GitHub → Render
─────────────────
1. git add .
2. git commit -m "النسخة الأولى"
3. git push
4. Render يبني وينشر تلقائياً ← رابط مباشر
```

## إضافة أسئلة جديدة / Adding Questions

افتح ملف `questions.js` وأضف أسئلتك بهذا الشكل:

```js
{
  topic: "اسم الموضوع",
  questionA: "سؤال الأغلبية",
  questionB: "سؤال الدخيل"
}
```

Open `questions.js` and add your own question pairs:

```js
{
  topic: "Topic Name",
  questionA: "Majority question",
  questionB: "Impostor question"
}
```

## هيكل المشروع / Project Structure

```
kashf-al-dakheel/
├── package.json        # تعريف المشروع والاعتماديات
├── server.js           # خادم اللعبة (Node.js + Socket.io)
├── questions.js        # بنك الأسئلة
├── README.md           # هذا الملف
└── public/
    ├── index.html      # واجهة المستخدم
    ├── style.css       # التصميم
    └── script.js       # منطق العميل
```

## التقنيات / Built With

- **Node.js** + **Express** - الخادم الخلفي
- **Socket.io** - الاتصال المباشر بين اللاعبين
- **HTML** + **CSS** + **JavaScript** - واجهة المستخدم (خفيفة، لا تحتاج أي مكتبات)

## الترخيص / License

MIT
