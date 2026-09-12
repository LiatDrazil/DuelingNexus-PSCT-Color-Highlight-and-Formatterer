// ==UserScript==
// @name         DuelingNexus - PSCT Color Highlighter & Formatter
// @namespace    https://github.com/LiatDrazil
// @version      1.8.0
// @description  Highlights PSCT conditions/costs and automatically formats card text spacing with maximum performance
// @author       LiatDrazil
// @match        https://duelingnexus.com/duel/*
// @match        https://duelingnexus.com/replay/*
// @match        https://duelingnexus.com/game/*
// @match        https://duelingnexus.com/editor/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/LiatDrazil/DuelingNexus-PSCT-Color-Highlight-and-Formatterer/main/script.user.js
// @updateURL    https://raw.githubusercontent.com/LiatDrazil/DuelingNexus-PSCT-Color-Highlight-and-Formatterer/main/script.user.js
// ==/UserScript==

(function () {
    'use strict';

    const PSCT_COLORS = {
        condition: '#F1FA8C', // Soft Pastel Yellow (Condition before ":")
        cost: '#FF79C6'       // Soft Pastel Pink/Magenta (Cost before ";")
    };

    function escapeHTML(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function findPSCTPunctuation(str, char) {
        let inQuotes = false;
        for (let i = 0; i < str.length; i++) {
            const current = str[i];
            if (current === '"' || current === '“' || current === '”' || current === "'") {
                inQuotes = !inQuotes;
            } else if (current === char && !inQuotes) {
                return i;
            }
        }
        return -1;
    }

    function formatSentencePSCT(sentence) {
        if (!sentence.trim()) return sentence;

        const colonIndex = findPSCTPunctuation(sentence, ':');
        const semicolonIndex = findPSCTPunctuation(sentence, ';');

        if (colonIndex !== -1 && semicolonIndex !== -1 && colonIndex < semicolonIndex) {
            const conditionPart = sentence.substring(0, colonIndex + 1);
            const costPart = sentence.substring(colonIndex + 1, semicolonIndex + 1);
            const effectPart = sentence.substring(semicolonIndex + 1);

            return `<span style="color: ${PSCT_COLORS.condition}; font-weight: 500;">${escapeHTML(conditionPart)}</span>` +
                   `<span style="color: ${PSCT_COLORS.cost}; font-weight: 500;">${escapeHTML(costPart)}</span>` +
                   escapeHTML(effectPart);
        }

        if (colonIndex !== -1) {
            const conditionPart = sentence.substring(0, colonIndex + 1);
            const effectPart = sentence.substring(colonIndex + 1);

            return `<span style="color: ${PSCT_COLORS.condition}; font-weight: 500;">${escapeHTML(conditionPart)}</span>` +
                   escapeHTML(effectPart);
        }

        if (semicolonIndex !== -1) {
            const costPart = sentence.substring(0, semicolonIndex + 1);
            const effectPart = sentence.substring(semicolonIndex + 1);

            return `<span style="color: ${PSCT_COLORS.cost}; font-weight: 500;">${escapeHTML(costPart)}</span>` +
                   escapeHTML(effectPart);
        }

        return escapeHTML(sentence);
    }

    // Splits text into sentences, isolating (Quick Effect) blocks into new lines
    function splitIntoSentences(text) {
        const sentences = [];
        let current = "";
        let inQuotes = false;
        let parenDepth = 0;
        let isAfterPeriodParen = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            current += char;

            if (char === '"' || char === '“' || char === '”') {
                inQuotes = !inQuotes;
            } else if (char === '(' && !inQuotes) {
                if (parenDepth === 0) {
                    const prevText = current.substring(0, current.length - 1).trimEnd();
                    if (prevText.endsWith('.')) {
                        isAfterPeriodParen = true;
                    }
                }
                parenDepth++;
            } else if (char === ')' && !inQuotes) {
                if (parenDepth > 0) parenDepth--;

                if (parenDepth === 0 && isAfterPeriodParen) {
                    isAfterPeriodParen = false;
                    if (i === text.length - 1 || text[i + 1] === ' ' || text[i + 1] === '\n') {
                        sentences.push(current);
                        current = "";
                        continue;
                    }
                }
            } else if (char === '.' && !inQuotes && parenDepth === 0) {
                let rest = text.substring(i + 1).trimStart();

                // If next block is (Quick Effect), force line split before it
                if (rest.startsWith('(Quick Effect)')) {
                    sentences.push(current);
                    current = "";
                    continue;
                }

                // Standard parenthetical handling following a period
                if (rest.startsWith('(')) {
                    continue;
                }

                if (i === text.length - 1 || text[i + 1] === ' ' || text[i + 1] === '\n') {
                    sentences.push(current);
                    current = "";
                }
            }
        }

        if (current.length > 0) sentences.push(current);
        return sentences;
    }

    function processText(text) {
        if (!text) return text;

        const lines = text.split('\n');
        const formattedBlocks = lines.map(line => {
            if (!line.trim()) return '';
            const sentences = splitIntoSentences(line);
            return sentences
                .map(sentence => formatSentencePSCT(sentence.trim()))
                .filter(s => s.length > 0)
                .join('<br><br>');
        });

        return formattedBlocks.filter(b => b.length > 0).join('<br><br>');
    }

    let observer = null;

    function processCardDescription(cardDescription) {
        const rawText = cardDescription.innerText;
        if (!rawText) return;

        const normalizedText = rawText.replace(/\r/g, '').trim();

        if (cardDescription.getAttribute('data-psct-cache') === normalizedText) return;

        cardDescription.setAttribute('data-psct-cache', normalizedText);

        if (observer) observer.disconnect();

        cardDescription.innerHTML = processText(normalizedText);

        if (observer) {
            observer.observe(cardDescription, {
                childList: true,
                characterData: true,
                subtree: true
            });
        }
    }

    function observeCardDescription() {
        const cardDescription = document.getElementById('card-description');
        if (!cardDescription) {
            setTimeout(observeCardDescription, 200);
            return;
        }

        observer = new MutationObserver(() => {
            processCardDescription(cardDescription);
        });

        processCardDescription(cardDescription);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeCardDescription);
    } else {
        observeCardDescription();
    }
})();
