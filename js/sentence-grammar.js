/**
 * Stage0/1 light grammar for sentence practice (pedagogy 2026-10-15).
 * One issue at a time; Chinese tip + optional short rule.
 */
(function (root) {
  "use strict";

  var VOWEL_LETTER = /^[aeiou]/i;
  /* Beginner exceptions: consonant letter but vowel sound → an */
  var AN_FORCE = { hour:1, honest:1, honour:1, honor:1, heir:1 };
  /* Vowel letter but consonant sound → a */
  var A_FORCE = {
    university:1, universities:1, uniform:1, uniforms:1, european:1,
    one:1, once:1, used:1, useful:1, unit:1, units:1, euro:1, unicorn:1
  };
  var SINGULAR_S = {
    bus:1, class:1, glass:1, boss:1, dress:1, grass:1, address:1,
    business:1, news:1, maths:1, mathematics:1, physics:1, jeans:1,
    tennis:1, series:1, species:1, lens:1, gas:1, plus:1, this:1, circus:1
  };

  function norm(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function needsAn(word) {
    var w = String(word || "").toLowerCase().replace(/[^a-z']/g, "");
    if (!w) return false;
    if (AN_FORCE[w]) return true;
    if (A_FORCE[w]) return false;
    return VOWEL_LETTER.test(w);
  }

  function checkArticleAN(text) {
    var re = /\b(a|an)\s+([A-Za-z']+)/gi;
    var m;
    while ((m = re.exec(text))) {
      var art = m[1].toLowerCase();
      var word = m[2];
      var wantAn = needsAn(word);
      if (art === "a" && wantAn) {
        return {
          ok: false,
          tip: word + " 以元音开头，用 an（写成 an " + word + "）",
          rule: "a / an：后面单词以元音音素开头用 an（apple、English、hour）；以辅音音素开头用 a（book、university）。"
        };
      }
      if (art === "an" && !wantAn) {
        return {
          ok: false,
          tip: word + " 不是元音开头，用 a（写成 a " + word + "）",
          rule: "a / an：后面单词以元音音素开头用 an（apple、English、hour）；以辅音音素开头用 a（book、university）。"
        };
      }
    }
    return null;
  }

  function checkPluralArticle(text) {
    var re = /\ba\s+([A-Za-z']+)s\b/gi;
    var m;
    while ((m = re.exec(text))) {
      var base = m[1].toLowerCase();
      var full = (m[1] + "s").toLowerCase();
      if (SINGULAR_S[full] || SINGULAR_S[base]) continue;
      /* skip if looks like verb-ish short words */
      if (base.length < 2) continue;
      return {
        ok: false,
        tip: "a 后面一般不加复数，试试 a " + base + " 或把 a 去掉",
        rule: "a / an 后面跟单数可数名词：可以说 a book，不说 a books。"
      };
    }
    return null;
  }

  function checkSubjectVerb(text) {
    var low = text.toLowerCase();
    /* I + wrong be/have */
    if (/\bi\s+is\b/.test(low)) {
      return { ok:false, tip:"I 后面用 am，不是 is", rule:"I am；he/she/it is；you/we/they are。I have；he/she/it has。" };
    }
    if (/\bi\s+are\b/.test(low)) {
      return { ok:false, tip:"I 后面用 am，不是 are", rule:"I am；he/she/it is；you/we/they are。I have；he/she/it has。" };
    }
    if (/\bi\s+has\b/.test(low)) {
      return { ok:false, tip:"I 后面用 have，不是 has", rule:"I am；he/she/it is；you/we/they are。I have；he/she/it has。" };
    }
    /* he/she/it + wrong be/have */
    if (/\b(he|she|it)\s+am\b/.test(low)) {
      return { ok:false, tip:"he/she/it 后面用 is，不是 am", rule:"I am；he/she/it is；you/we/they are。I have；he/she/it has。" };
    }
    if (/\b(he|she|it)\s+are\b/.test(low)) {
      return { ok:false, tip:"he/she/it 后面用 is，不是 are", rule:"I am；he/she/it is；you/we/they are。I have；he/she/it has。" };
    }
    if (/\b(he|she|it)\s+have\b/.test(low)) {
      return { ok:false, tip:"he/she/it 后面用 has，不是 have", rule:"I am；he/she/it is；you/we/they are。I have；he/she/it has。" };
    }
    return null;
  }

  function checkCapsPunct(text) {
    /* 有则查：像完整句（≥3 词或已有句末标点）才查句首大写；有句末标点则认可 .?! */
    var words = text.split(/\s+/).filter(Boolean);
    var end = text.slice(-1);
    var looksFull = words.length >= 3 || /[.!?…]/.test(end);
    if (!looksFull) return null;
    if (/[.!?]/.test(text) && !/[.!?…]["')\]]*$/.test(text)) {
      return {
        ok: false,
        tip: "句号或问号请放在句子最后",
        rule: "完整句子：句首大写，句末用 . 或 ? 或 !"
      };
    }
    var first = text.charAt(0);
    if (/[a-z]/.test(first)) {
      return {
        ok: false,
        tip: "句首请大写（写成 " + first.toUpperCase() + text.slice(1).replace(/\s+$/,"") + " 这样）",
        rule: "完整句子：句首大写，句末用 . 或 ? 或 !"
      };
    }
    return null;
  }

  function checkSentenceGrammar(text) {
    var t = norm(text);
    if (!t) return { ok: false, tip: "先写一句再检查～", rule: "" };
    var hit =
      checkArticleAN(t) ||
      checkSubjectVerb(t) ||
      checkPluralArticle(t) ||
      checkCapsPunct(t);
    if (hit) return hit;
    return { ok: true };
  }

  var api = { checkSentenceGrammar: checkSentenceGrammar, needsAn: needsAn };
  root.checkSentenceGrammar = checkSentenceGrammar;
  root.__SentenceGrammar = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
