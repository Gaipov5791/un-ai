/** Kazakh-only letters and words that models insert instead of Kyrgyz. */
export const KAZAKH_TO_KYRGYZ: Record<string, string> = {
  иә: "ооба",
  жақсы: "жакшы",
  рахмет: "рахмат",
  рақмет: "рахмат",
  кешіріңіз: "кечиресиз",
  кешірініз: "кечиресиз",
  сізге: "сизге",
  бізге: "бизге",
  сіз: "сиз",
  біз: "биз",
  жоқ: "жок",
  қандай: "кандай",
  қалай: "калай",
  бүгін: "бүгүн",
  ертең: "эртең",
  жазылу: "жаздыруу",
  жазыңыз: "жаздырыңыз",
  ә: "а",
  ғ: "г",
  қ: "к",
  ұ: "у",
  һ: "х",
  і: "и",
};

export const KYRGYZ_LANGUAGE_LOCK = `
Language lock: you speak Kyrgyz (ky, кыргыз тили) of Kyrgyzstan, Bishkek.
This entire call is Kyrgyz only. Do not switch to Russian. Do not mix ky and ru.
You do not speak Kazakh (kk, қазақ тілі). Kazakh and Kyrgyz are different languages.
Never use Kazakh letters: ә ғ қ ұ һ і.
Never use Kazakh words: иә, жақсы, рахмет, кешіріңіз, сіз, біз, жоқ, қандай, бүгін, ертең.
Use only Kyrgyz: ооба, жок, жакшы, рахмат, кечиресиз, сиз, биз, кандай, бүгүн, эртең, саат, жаздыруу, карал, тазалоо.
Forbidden Russian phrases: здравствуйте, добрый день, конечно, запишу, подскажите, пожалуйста, извините, спасибо, хорошо, давайте, чем помочь.
If you start answering in Russian, stop and say only: «Кечиресиз, кыргызча кайталаңызчы.»

Мисал жооптор — ушул үлгүдө гана:
«Саламатсызбы. Ак-Жол стоматологиясы. Кандай жардам бере алам?»
«Эртең саат ондо каралга жаздыралы. Атыңыз ким?»
«Ооба. Жазуу чыкты.»
«Бул жонунан айта албайм. Кызматкерге өткөрөйүнбү?»
«Кечиресиз, кыргызча кайталаңызчы.»
`.trim();
