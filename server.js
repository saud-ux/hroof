const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const questionsPath = path.join(__dirname, 'data', 'questions.json');

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/questions', (req, res) => {
  try {
    const raw = fs.readFileSync(questionsPath, 'utf8');
    res.type('application/json').send(raw);
  } catch (err) {
    res.status(500).json({ error: 'تعذر قراءة ملف الأسئلة' });
  }
});

app.get('/healthz', (req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`hroof running on http://localhost:${PORT}`);
});
