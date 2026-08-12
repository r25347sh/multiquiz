// scanner.js — MultiQuiz parser (supports .multiquiz / .mq)
// Variables, shuffle (questions / options), and human-readable blocks

const MultiQuizScanner = (function () {
  function parse(content) {
    const lines = content.split(/\r?\n/);
    const quiz = {
      title: 'クイズタイトル',
      description: '',
      points_default: 2,
      shuffle_questions: false,
      shuffle_options: false,
      variables: {},
      sections: []
    };

    let currentSection = null;
    let i = 0;

    while (i < lines.length) {
      let line = lines[i].trim();

      if (!line || line.startsWith('//')) {
        i++;
        continue;
      }

      if (line.startsWith('title:')) {
        quiz.title = unquote(line.substring(6).trim());
      } else if (line.startsWith('description:')) {
        quiz.description = unquote(line.substring(12).trim());
      } else if (line.startsWith('points_default:')) {
        quiz.points_default = parseInt(line.substring(15).trim(), 10) || 2;
      } else if (line.startsWith('shuffle_questions:')) {
        quiz.shuffle_questions = toBool(line.substring(18).trim());
      } else if (line.startsWith('shuffle_options:')) {
        quiz.shuffle_options = toBool(line.substring(16).trim());
      } else if (line.includes('=') && !line.startsWith('section:') && !line.startsWith('{')) {
        const eqIndex = line.indexOf('=');
        const key = line.substring(0, eqIndex).trim();
        let value = line.substring(eqIndex + 1).trim();
        value = unquote(value.replace(/;$/, ''));
        quiz.variables[key] = value;
      } else if (line.startsWith('section:')) {
        currentSection = {
          title: unquote(line.substring(8).trim()),
          questions: [],
          shuffle: null
        };
        const shuffleMatch = line.match(/shuffle\s*:\s*(true|false)/i);
        if (shuffleMatch) {
          currentSection.shuffle = toBool(shuffleMatch[1]);
        }
        quiz.sections.push(currentSection);
      } else if (line.startsWith('{')) {
        let block = '';
        let braceCount = 1;
        block += line + '\n';
        i++;

        while (i < lines.length && braceCount > 0) {
          const nextLine = lines[i];
          block += nextLine + '\n';
          const open = (nextLine.match(/\{/g) || []).length;
          const close = (nextLine.match(/\}/g) || []).length;
          braceCount += open - close;
          i++;
        }

        if (currentSection) {
          const question = parseQuestionBlock(block, quiz.points_default);
          if (question) {
            expandVariables(question, quiz.variables);
            currentSection.questions.push(question);
          }
        }
        continue;
      }

      i++;
    }

    applyShuffle(quiz);
    return quiz;
  }

  function unquote(s) {
    if (!s) return '';
    s = s.trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
    return s;
  }

  function toBool(v) {
    if (typeof v === 'boolean') return v;
    const s = String(v).toLowerCase().trim();
    return s === 'true' || s === '1' || s === 'yes' || s === 'on';
  }

  function parseQuestionBlock(blockStr, defaultPoints) {
    try {
      let cleaned = blockStr
        .replace(/\/\/.*$/gm, '')
        .replace(/(\w+)\s*:/g, '"$1":')
        .replace(/,\s*([}\]])/g, '$1')
        .trim();

      const func = new Function('return ' + cleaned);
      const q = func();

      if (q.points == null) q.points = defaultPoints;
      if (!q.type) q.type = 'input';
      if (q.shuffle_options == null) q.shuffle_options = null;

      return q;
    } catch (e) {
      console.error('Question block parse error:', blockStr.substring(0, 120), e);
      return null;
    }
  }

  function expandVariables(obj, vars) {
    if (!vars || Object.keys(vars).length === 0) return;

    function replaceStr(str) {
      if (typeof str !== 'string') return str;
      return str.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return vars[key] != null ? vars[key] : '{{' + key + '}}';
      });
    }

    if (obj.question) obj.question = replaceStr(obj.question);
    if (obj.note) obj.note = replaceStr(obj.note);
    if (Array.isArray(obj.options)) {
      obj.options = obj.options.map(replaceStr);
    }
    if (Array.isArray(obj.items)) {
      obj.items = obj.items.map(replaceStr);
    }
    if (Array.isArray(obj.left)) {
      obj.left = obj.left.map(replaceStr);
    }
    if (Array.isArray(obj.right)) {
      obj.right = obj.right.map(replaceStr);
    }
    if (obj.blanks && typeof obj.blanks === 'object') {
      const newBlanks = {};
      for (const k of Object.keys(obj.blanks)) {
        newBlanks[k] = replaceStr(obj.blanks[k]);
      }
      obj.blanks = newBlanks;
    }
    if (typeof obj.correct === 'string') {
      obj.correct = replaceStr(obj.correct);
    }
  }

  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function applyShuffle(quiz) {
    quiz.sections.forEach(section => {
      const doShuffle =
        section.shuffle != null ? section.shuffle : quiz.shuffle_questions;
      if (doShuffle && section.questions.length > 1) {
        section.questions = shuffleArray(section.questions);
      }

      section.questions.forEach(q => {
        const doOpt =
          q.shuffle_options != null ? q.shuffle_options : quiz.shuffle_options;
        if (!doOpt) return;

        if (q.type === 'single' || q.type === 'multiple') {
          if (Array.isArray(q.options) && q.options.length > 1) {
            const indexed = q.options.map((text, idx) => ({ text, idx }));
            const shuffled = shuffleArray(indexed);
            q.options = shuffled.map(x => x.text);
            const map = {};
            shuffled.forEach((x, newIdx) => {
              map[x.idx] = newIdx;
            });
            if (q.type === 'single') {
              q.correct = map[q.correct];
            } else if (Array.isArray(q.correct)) {
              q.correct = q.correct.map(old => map[old]).sort((a, b) => a - b);
            }
          }
        } else if (q.type === 'sort' && Array.isArray(q.items)) {
          q.items = shuffleArray(q.items);
        } else if (q.type === 'matching') {
          if (Array.isArray(q.right) && q.right.length > 1) {
            const indexed = q.right.map((text, idx) => ({ text, idx }));
            const shuffled = shuffleArray(indexed);
            q.right = shuffled.map(x => x.text);
            const map = {};
            shuffled.forEach((x, newIdx) => {
              map[x.idx] = newIdx;
            });
            if (Array.isArray(q.correct)) {
              q.correct = q.correct.map(old => map[old]);
            }
          }
        }
      });
    });
  }

  return { parse };
})();

window.MultiQuizScanner = MultiQuizScanner;
