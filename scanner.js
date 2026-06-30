// scanner.js
const MultiQuizScanner = (function() {
    function parse(content) {
        const lines = content.split('\n');
        const quiz = {
            title: "クイズタイトル",
            description: "",
            points_default: 2,
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
                quiz.title = line.substring(6).trim().replace(/^"|"$/g, '');
            } 
            else if (line.startsWith('description:')) {
                quiz.description = line.substring(12).trim().replace(/^"|"$/g, '');
            } 
            else if (line.startsWith('points_default:')) {
                quiz.points_default = parseInt(line.substring(15).trim()) || 2;
            } 
            else if (line.includes('=') && !line.startsWith('section:')) {
                // 変数定義
                const eqIndex = line.indexOf('=');
                const key = line.substring(0, eqIndex).trim();
                let value = line.substring(eqIndex + 1).trim().replace(/^"|"|;$/g, '');
                quiz.variables[key] = value;
            } 
            else if (line.startsWith('section:')) {
                currentSection = {
                    title: line.substring(8).trim().replace(/^"|"$/g, ''),
                    questions: []
                };
                quiz.sections.push(currentSection);
            } 
            else if (line.startsWith('{')) {
                // 質問ブロックの収集
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
                    const question = parseQuestionBlock(block);
                    if (question) {
                        currentSection.questions.push(question);
                    }
                }
                continue;
            }

            i++;
        }

        return quiz;
    }

    function parseQuestionBlock(blockStr) {
        try {
            let cleaned = blockStr
                .replace(/\/\/.*$/gm, '')                    // コメント除去
                .replace(/(\w+)\s*:/g, '"$1":')              // キー引用符付け
                .replace(/,\s*([}\]])/g, '$1')               // 末尾カンマ除去
                .trim();

            // 安全にオブジェクト化
            const func = new Function('return ' + cleaned);
            const q = func();

            if (!q.points) q.points = 2;
            if (!q.type) q.type = 'input';

            return q;
        } catch (e) {
            console.error('Question block parse error:', blockStr.substring(0, 100), e);
            return null;
        }
    }

    return { parse };
})();

// グローバルに公開（HTMLから参照するため必須）
window.MultiQuizScanner = MultiQuizScanner;
