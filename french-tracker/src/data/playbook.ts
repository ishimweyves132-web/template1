import type { Activity } from "../lib/model";

export interface Tip { id: string; title: string; hook: string; why: string; steps: string[]; activity: Activity | "all"; minutes: number }

// Habits that language-learning research and teaching practice broadly agree on. Written as practical drills.
// Nothing here is magic; "feels illegal" comes from doing these every day instead of passively studying.
export const TIPS: Tip[] = [
  { id: "frequency", title: "Learn the most common words first", activity: "vocabulary", minutes: 10,
    hook: "A few hundred high-frequency words make up a large share of everyday speech.",
    why: "Rare words can wait. Common words appear in every conversation, so each one you learn pays back again and again.",
    steps: ["Start with the Dictionary's built-in words: pronouns, question words, connectors, the 30 most useful verbs.", "Save 5 new words a day to your Vocabulary; skip anything you will not hear within a week.", "Say each word inside the example sentence, not alone."] },
  { id: "chunks", title: "Learn phrases, not isolated words", activity: "vocabulary", minutes: 10,
    hook: "Native speakers speak in ready-made chunks. Borrow them whole.",
    why: "A chunk like « Ça dépend » or « J'ai hâte de… » comes with correct grammar and rhythm built in, so you speak faster with fewer mistakes.",
    steps: ["Open the Phrasebook and pick one situation (café, opinions, plans).", "Save 3 phrases and say each out loud 5 times.", "Use one of them in a real or imagined conversation today."] },
  { id: "shadowing", title: "Shadow native speakers", activity: "shadowing", minutes: 10,
    hook: "Speak along with a native recording, a half-second behind. Pronunciation and rhythm improve fastest this way.",
    why: "It trains your mouth, your ear and your speed together, and it needs no partner.",
    steps: ["Pick a 30–60 second clip you partly understand.", "Listen once. Then play it again and speak with it, copying rhythm and melody, not just words.", "Repeat the same clip 5 times, then record yourself once and compare."] },
  { id: "spaced", title: "Review on a schedule", activity: "vocabulary", minutes: 10,
    hook: "Reviewing a word just as you are about to forget it is the most efficient way to keep it.",
    why: "The app schedules each saved word at 1, 3, 7, 14, 30 and 60 days. Short, timely reviews beat long cramming.",
    steps: ["Open Vocabulary and tap the Due filter.", "Look at the French, recall the meaning, then check.", "Tap “I reviewed this”. The next review moves further out."] },
  { id: "speak-early", title: "Speak out loud, every day", activity: "speaking", minutes: 15,
    hook: "You get better at speaking by speaking. Reading silently does not train your mouth.",
    why: "Retrieving words under time pressure is a different skill from recognising them. Practise the skill you want.",
    steps: ["Describe your day or a photo out loud for 3 minutes. No notes, no stopping.", "When you get stuck, use a simpler word or a filler like « alors » or « en fait » and keep going.", "Write down 2 words you lacked, and look them up afterwards."] },
  { id: "input", title: "Listen to material you mostly understand", activity: "listening", minutes: 20,
    hook: "Aim for audio where you catch roughly 70–90%. Too hard teaches little; too easy teaches nothing.",
    why: "Understandable input is what your brain builds language from. Repeating the same audio makes new patterns stick.",
    steps: ["Choose one short episode or video made for learners or slow native speech.", "Listen once for the gist, a second time catching details, a third time with the transcript if you have one.", "Re-listen to the same audio on another day. Repetition is the point."] },
  { id: "output", title: "Write five sentences a day, in your own words", activity: "writing", minutes: 10,
    hook: "Writing slows the language down so you can notice what you do not know.",
    why: "Using new words and grammar yourself, rather than recognising them, is what moves them into active use.",
    steps: ["Write 5 sentences about today using one new word or phrase each.", "Re-read them aloud.", "Rewrite one sentence a different way, with a different tense or connector."] },
  { id: "grammar-use", title: "Learn grammar through examples you can reuse", activity: "grammar", minutes: 10,
    hook: "Take one pattern, then make it yours with three sentences about your own life.",
    why: "A rule you have used in your own sentences is far more likely to appear in your speech than one you only read.",
    steps: ["Pick one point (e.g. passé composé with être).", "Copy two example sentences, then write three of your own.", "Add the best one to your Vocabulary as an example."] },
  { id: "immersion", title: "Make French part of your day", activity: "immersion", minutes: 15,
    hook: "Turn dead time (commute, cooking, walking) into listening time, and change one device to French.",
    why: "Many small contacts a day add up to a lot of hours, and they cost no willpower.",
    steps: ["Switch your phone or a favourite app to French.", "Put a French playlist or podcast on for one daily routine.", "Narrate one small task in French in your head (« Je prépare le café »)."] },
  { id: "read", title: "Read short texts you can finish", activity: "reading", minutes: 10,
    hook: "A page you can finish beats a book you abandon.",
    why: "Reading shows you how words and phrases sit together, and you can pause to learn them.",
    steps: ["Pick a short article, a message thread or a product description.", "Underline 3 words you want. Do not look up the rest.", "Read it again the next day: it should feel easier."] },
  { id: "never-twice", title: "Never miss twice", activity: "all", minutes: 10,
    hook: "One missed day is nothing. Two in a row starts a new habit: stopping.",
    why: "Consistency beats intensity. The tracker counts every minute honestly, so even a 10-minute day keeps the pattern alive.",
    steps: ["If you missed yesterday, do any 10 minutes today, even Shadowing a single clip.", "Log it. A small honest entry beats an empty day.", "Split your 80 minutes across the day if that makes it easier."] },
  { id: "balance", title: "Train your weakest skill first", activity: "all", minutes: 10,
    hook: "Progress is limited by the skill you avoid. Check Focus and start there.",
    why: "Most learners over-practise what feels comfortable. Putting the neglected activity first, while fresh, fixes the imbalance.",
    steps: ["Open Focus and find the activity with the lowest share of its target.", "Do 10 minutes of that one before anything else.", "Check again in a week: has the gap narrowed?"] },
];

export const tipFor = (a: Activity): Tip => TIPS.find((t) => t.activity === a) ?? TIPS[0]!;
export const tipById = (id: string): Tip | undefined => TIPS.find((t) => t.id === id);
