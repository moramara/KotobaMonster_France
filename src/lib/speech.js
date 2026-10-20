/* speech.js — フランス語の読み上げ(Web Speech API)の薄い包み。
   ブラウザでは window.Speech、Node では require('./speech.js') で使えます。DOM・localStorage
   には触りません。お知らせ(トースト)は、呼び出し側が notify として渡します。

   createSpeech({ win, notify }) → { supported, speechOK, speak, cancel }
     win     : speechSynthesis / SpeechSynthesisUtterance を持つオブジェクト(通常は window)
     notify  : 利用者へ知らせる関数 (msg) => void(省略可)
   ・supported : この端末に読み上げの仕組みがあるか(声の有無は問わない)
   ・speechOK  : フランス語の声が見つかっていて、すぐ読み上げられるか
   ・speak(text, { onend }) : 読み上げる。onend は終了・失敗・中断のときに呼ぶ。開始できたら true
   ・cancel()  : 読み上げを止める(失敗しても例外を出さない) */
(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.Speech = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createSpeech(opts) {
    const win = (opts && opts.win) || {},
      notify = (opts && opts.notify) || function () {};
    const synth =
      'speechSynthesis' in win && 'SpeechSynthesisUtterance' in win ? win.speechSynthesis : null;
    // 読み上げに使うフランス語の声(見つからなければ null)
    let frVoice = null;
    function pickVoice() {
      if (!synth) return;
      try {
        const vs = synth.getVoices();
        frVoice =
          vs.find(v => (v.lang || '').replace('_', '-').toLowerCase() === 'fr-fr') ||
          vs.find(v => (v.lang || '').toLowerCase().indexOf('fr') === 0) ||
          null;
      } catch (e) {
        frVoice = null;
      }
    }
    if (synth) {
      pickVoice();
      if (synth.addEventListener) synth.addEventListener('voiceschanged', pickVoice);
    }
    // フランス語の読み上げが使えるか
    const speechOK = () => !!(synth && frVoice);
    // opt.onend: 読み上げが終わった(または失敗・中断した)ときに呼ぶ。BOTおまかせ復習が、
    // 読み上げの終了を待つために使う
    function speak(text, opt) {
      if (!synth) {
        notify('この端末では音声が使えません');
        return false;
      }
      try {
        if (!frVoice) {
          pickVoice();
          if (!frVoice) notify('フランス語の音声が見つかりません');
        }
        synth.cancel();
        const u = new win.SpeechSynthesisUtterance(text);
        u.lang = 'fr-FR';
        u.rate = 0.85;
        if (frVoice) u.voice = frVoice;
        if (opt && typeof opt.onend === 'function') {
          u.onend = opt.onend;
          u.onerror = opt.onend;
        }
        synth.speak(u);
        return true;
      } catch (e) {
        notify('音声を再生できませんでした');
        return false;
      }
    }
    // 読み上げを止める(読み上げの仕組みがない・失敗したときは何もしない)
    function cancel() {
      if (!synth) return;
      try {
        synth.cancel();
      } catch (e) {
        /* 何もしない */
      }
    }
    return { supported: !!synth, speechOK, speak, cancel };
  }

  return { createSpeech };
});
