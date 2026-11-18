// Built-in phrasebook. ORIGINAL work written for this app. Line format:  category | French | English | note (register / usage)
const RAW = `
Politeness|Bonjour, comment allez-vous ?|Hello, how are you? (formal)|Formal; use with strangers, shop staff, older people
Politeness|Ça va ? — Ça va bien, et toi ?|How's it going? — Fine, and you?|Informal; the standard everyday exchange
Politeness|Merci beaucoup.|Thank you very much.|
Politeness|De rien.|You're welcome.|Literally "of nothing"
Politeness|Je vous en prie.|You're welcome. / Please, go ahead.|Formal
Politeness|Excusez-moi de vous déranger.|Sorry to bother you.|Formal; use before asking a stranger something
Politeness|Pardon, je n'ai pas bien entendu.|Sorry, I didn't hear properly.|
Politeness|Enchanté(e).|Nice to meet you.|Add -e if you are a woman
Politeness|Bonne journée !|Have a good day!|Said when leaving
Politeness|Bonne soirée !|Have a good evening!|
Politeness|À bientôt !|See you soon!|
Politeness|Bon appétit !|Enjoy your meal!|
Politeness|À tes souhaits !|Bless you! (after a sneeze)|Informal; formal: À vos souhaits
Introductions|Je m'appelle Marc.|My name is Marc.|Literally "I call myself"
Introductions|Je viens du Canada.|I come from Canada.|Use "de la / du / d'" depending on the country
Introductions|J'habite à Lyon depuis deux ans.|I've lived in Lyon for two years.|"depuis" + present tense for ongoing situations
Introductions|J'ai vingt-cinq ans.|I am twenty-five years old.|French says "I have … years"
Introductions|Je suis étudiant(e).|I am a student.|No article before a profession
Introductions|Je travaille dans l'informatique.|I work in IT.|
Introductions|J'apprends le français depuis six mois.|I've been learning French for six months.|
Introductions|Je parle un peu français.|I speak a little French.|
Introductions|Et vous, que faites-vous dans la vie ?|And you, what do you do for a living?|Formal
Understanding|Je ne comprends pas.|I don't understand.|
Understanding|Pouvez-vous répéter, s'il vous plaît ?|Can you repeat that, please?|Formal
Understanding|Pouvez-vous parler plus lentement ?|Can you speak more slowly?|
Understanding|Qu'est-ce que ça veut dire ?|What does that mean?|
Understanding|Comment dit-on « tomorrow » en français ?|How do you say "tomorrow" in French?|
Understanding|Comment ça s'écrit ?|How is that spelled?|
Understanding|Je cherche mes mots.|I'm looking for my words.|Useful when you hesitate
Understanding|Attendez, je réfléchis.|Wait, I'm thinking.|
Understanding|Je n'ai pas compris le dernier mot.|I didn't understand the last word.|
Understanding|Vous pouvez l'écrire ?|Can you write it down?|
Getting around|Où est la gare, s'il vous plaît ?|Where is the station, please?|
Getting around|C'est loin d'ici ?|Is it far from here?|
Getting around|Tournez à gauche, puis tout droit.|Turn left, then straight ahead.|
Getting around|C'est à droite, après le pont.|It's on the right, after the bridge.|
Getting around|Un billet pour Paris, s'il vous plaît.|A ticket to Paris, please.|
Getting around|À quelle heure part le prochain train ?|What time does the next train leave?|
Getting around|Est-ce que ce bus va au centre-ville ?|Does this bus go to the city centre?|
Getting around|Je suis perdu(e).|I'm lost.|
Getting around|Je descends au prochain arrêt.|I'm getting off at the next stop.|
Café & restaurant|Une table pour deux, s'il vous plaît.|A table for two, please.|
Café & restaurant|Je voudrais un café, s'il vous plaît.|I would like a coffee, please.|"Je voudrais" is the polite way to order
Café & restaurant|Qu'est-ce que vous me conseillez ?|What do you recommend?|
Café & restaurant|Je vais prendre le menu du jour.|I'll have the set menu of the day.|
Café & restaurant|L'addition, s'il vous plaît.|The bill, please.|
Café & restaurant|Je suis allergique aux noix.|I'm allergic to nuts.|
Café & restaurant|C'est délicieux !|It's delicious!|
Café & restaurant|Est-ce qu'on peut payer par carte ?|Can we pay by card?|
Café & restaurant|Une carafe d'eau, s'il vous plaît.|A jug of tap water, please.|Free in French restaurants
Shopping|Combien ça coûte ?|How much does it cost?|
Shopping|Je regarde seulement, merci.|I'm just looking, thanks.|
Shopping|Vous avez ça en plus grand ?|Do you have this in a bigger size?|
Shopping|C'est un peu trop cher pour moi.|It's a bit too expensive for me.|
Shopping|Je le prends.|I'll take it.|
Shopping|Vous acceptez les cartes ?|Do you take cards?|
Shopping|Je voudrais un sac, s'il vous plaît.|I'd like a bag, please.|
Shopping|Où sont les cabines d'essayage ?|Where are the fitting rooms?|
Opinions|À mon avis, c'est une bonne idée.|In my opinion, it's a good idea.|
Opinions|Je pense que tu as raison.|I think you're right.|
Opinions|Je ne suis pas d'accord.|I don't agree.|
Opinions|Je suis tout à fait d'accord.|I completely agree.|
Opinions|Ça dépend.|It depends.|
Opinions|Ça m'est égal.|I don't mind. / It's all the same to me.|
Opinions|Je préfère rester à la maison.|I prefer to stay at home.|
Opinions|Ce n'est pas mal du tout.|It's not bad at all.|
Opinions|Je trouve ça un peu trop long.|I find that a bit too long.|
Opinions|D'un côté…, de l'autre…|On one hand…, on the other…|Useful for debates
Opinions|Il faut reconnaître que…|It must be admitted that…|Debate / argument
Feelings|Je suis ravi(e) de te voir.|I'm delighted to see you.|
Feelings|J'ai envie de dormir.|I feel like sleeping.|"avoir envie de" = to feel like
Feelings|J'ai hâte de partir en vacances.|I can't wait to go on holiday.|
Feelings|Ça me fait plaisir.|That makes me happy.|
Feelings|J'en ai marre.|I'm fed up.|Informal
Feelings|Je suis un peu stressé(e).|I'm a bit stressed.|
Feelings|Ne t'inquiète pas.|Don't worry.|Informal
Connectors & fillers|En fait, je n'ai pas le temps.|Actually, I don't have time.|"en fait" ≈ actually / in fact
Connectors & fillers|Du coup, on reste ici.|So, we're staying here.|Very common spoken "so"
Connectors & fillers|Alors, qu'est-ce qu'on fait ?|So, what shall we do?|
Connectors & fillers|C'est-à-dire que…|That is to say…|
Connectors & fillers|Par contre, c'est plus cher.|On the other hand, it's more expensive.|
Connectors & fillers|D'ailleurs, il arrive demain.|By the way, he's arriving tomorrow.|
Connectors & fillers|De toute façon, on verra.|Anyway, we'll see.|
Connectors & fillers|Bref, c'était une longue journée.|In short, it was a long day.|
Connectors & fillers|Pourtant, j'ai bien étudié.|Yet I did study well.|
Connectors & fillers|Tout à fait.|Exactly. / Absolutely.|
Connectors & fillers|Pas du tout.|Not at all.|
Connectors & fillers|Bien sûr !|Of course!|
Connectors & fillers|Ah bon ?|Oh really?|Reaction used constantly in conversation
Time & plans|Qu'est-ce que tu fais ce week-end ?|What are you doing this weekend?|
Time & plans|On se retrouve à huit heures ?|Shall we meet at eight?|
Time & plans|Je suis libre demain après-midi.|I'm free tomorrow afternoon.|
Time & plans|Désolé, je suis en retard.|Sorry, I'm late.|
Time & plans|Je serai là dans dix minutes.|I'll be there in ten minutes.|Future tense
Time & plans|On remet ça à la semaine prochaine ?|Shall we postpone it to next week?|
Time & plans|Je dois annuler notre rendez-vous.|I have to cancel our appointment.|
Past & future|Hier, je suis allé(e) au marché.|Yesterday I went to the market.|passé composé with être
Past & future|J'ai regardé un film avec mes amis.|I watched a film with my friends.|passé composé with avoir
Past & future|Quand j'étais petit, j'habitais à la campagne.|When I was little, I lived in the countryside.|imparfait for habits and background
Past & future|Je vais commencer un nouveau travail.|I'm going to start a new job.|futur proche: aller + infinitive
Past & future|L'année prochaine, je voudrais voyager en France.|Next year I'd like to travel to France.|
Past & future|Si j'avais plus de temps, j'étudierais plus.|If I had more time, I would study more.|si + imparfait → conditionnel
Past & future|J'espère que tout se passera bien.|I hope everything will go well.|
Health & help|J'ai mal à la tête.|I have a headache.|"avoir mal à" + body part
Health & help|Je ne me sens pas bien.|I don't feel well.|
Health & help|Où est la pharmacie la plus proche ?|Where is the nearest pharmacy?|
Health & help|J'ai besoin d'un médecin.|I need a doctor.|
Health & help|Appelez une ambulance !|Call an ambulance!|112 is the European emergency number
Health & help|Pouvez-vous m'aider ?|Can you help me?|
Health & help|J'ai perdu mon portefeuille.|I've lost my wallet.|
Work & study|Je suis en réunion.|I'm in a meeting.|
Work & study|Pouvez-vous m'envoyer le document par e-mail ?|Can you email me the document?|
Work & study|Je vous écris au sujet de…|I am writing to you about…|Formal email opener
Work & study|Cordialement,|Kind regards,|Formal email closing
Work & study|Je n'ai pas encore terminé.|I haven't finished yet.|
Work & study|J'ai une question sur l'exercice.|I have a question about the exercise.|
Phone & messages|Allô ? Qui est à l'appareil ?|Hello? Who's speaking?|
Phone & messages|Je vous rappelle plus tard.|I'll call you back later.|
Phone & messages|Je n'ai plus de batterie.|I'm out of battery.|
Phone & messages|Je t'envoie un message.|I'll send you a message.|
Phone & messages|Tu peux m'envoyer l'adresse ?|Can you send me the address?|
Small talk|Il fait beau aujourd'hui, non ?|The weather's nice today, isn't it?|
Small talk|Tu as passé un bon week-end ?|Did you have a good weekend?|
Small talk|Ça fait longtemps !|Long time no see!|
Small talk|Qu'est-ce que tu as fait de beau ?|What have you been up to?|
Small talk|C'est une longue histoire.|It's a long story.|
Small talk|Quoi de neuf ?|What's new?|
Small talk|On garde le contact.|Let's keep in touch.|
`;

export interface Phrase { cat: string; fr: string; en: string; note: string }
export const PHRASES: Phrase[] = RAW.trim().split("\n").map((l) => {
  const [cat = "", fr = "", en = "", note = ""] = l.split("|");
  return { cat, fr, en, note };
});
export const PHRASE_CATEGORIES = [...new Set(PHRASES.map((p) => p.cat))];
