// Built-in starter dictionary. ORIGINAL work written for this app (no third-party dictionary text), so it is
// freely redistributable with it. It is a curated list of high-frequency words, NOT a complete dictionary.
// Line format:  headword | part of speech | gender (m/f/mf/blank) | English | French example | English example
const RAW = `
je|pron||I|Je suis fatigué.|I am tired.
tu|pron||you (informal, singular)|Tu parles français ?|Do you speak French?
il|pron||he; it|Il habite à Paris.|He lives in Paris.
elle|pron||she; it|Elle travaille ici.|She works here.
nous|pron||we; us|Nous mangeons ensemble.|We eat together.
vous|pron||you (formal or plural)|Vous êtes très gentil.|You are very kind.
ils|pron||they (masculine or mixed)|Ils sont en retard.|They are late.
elles|pron||they (feminine)|Elles arrivent demain.|They arrive tomorrow.
on|pron||one; we (informal)|On y va ?|Shall we go?
qui|pron||who|Qui est là ?|Who is there?
que|pron||what; that|Que veux-tu ?|What do you want?
quoi|pron||what (informal, or after a preposition)|De quoi parles-tu ?|What are you talking about?
le|det|m|the|Le livre est ouvert.|The book is open.
la|det|f|the|La maison est grande.|The house is big.
les|det||the (plural)|Les enfants jouent.|The children are playing.
un|det|m|a, an; one|J'ai un frère.|I have a brother.
une|det|f|a, an; one|Elle a une idée.|She has an idea.
des|det||some; (plural of un/une)|Il a des amis.|He has friends.
ce|det|m|this, that|Ce film est super.|This film is great.
cette|det|f|this, that|Cette ville est belle.|This city is beautiful.
mon|det|m|my|Mon père est médecin.|My father is a doctor.
ma|det|f|my|Ma sœur habite ici.|My sister lives here.
mes|det||my (plural)|Mes amis arrivent.|My friends are arriving.
et|conj||and|Du pain et du fromage.|Bread and cheese.
ou|conj||or|Thé ou café ?|Tea or coffee?
mais|conj||but|Je veux venir, mais je suis occupé.|I want to come, but I am busy.
donc|conj||so, therefore|Je pense, donc je suis.|I think, therefore I am.
parce que|conj||because|Je reste ici parce qu'il pleut.|I'm staying here because it's raining.
pourquoi|adv||why|Pourquoi tu pleures ?|Why are you crying?
comment|adv||how|Comment ça va ?|How are you?
quand|adv||when|Quand arrives-tu ?|When are you arriving?
où|adv||where|Où habites-tu ?|Where do you live?
combien|adv||how much; how many|Combien ça coûte ?|How much does it cost?
dans|prep||in, inside|Il est dans la cuisine.|He is in the kitchen.
sur|prep||on|Mets-le sur la chaise.|Put it on the chair.
sous|prep||under|Le chat dort sous le lit.|The cat sleeps under the bed.
avec|prep||with|Je viens avec toi.|I'm coming with you.
sans|prep||without|Un café sans sucre, s'il vous plaît.|A coffee without sugar, please.
pour|prep||for; in order to|C'est pour toi.|It's for you.
de|prep||of; from|Elle vient de Lyon.|She comes from Lyon.
à|prep||to; at; in|Je vais à l'école.|I am going to school.
chez|prep||at (someone's) home|Je suis chez moi.|I am at home.
entre|prep||between|Entre toi et moi.|Between you and me.
pendant|prep||during; for|J'étudie pendant une heure.|I study for an hour.
avant|prep||before|Lave-toi les mains avant de manger.|Wash your hands before eating.
après|prep||after|On mange après le film.|We eat after the film.
depuis|prep||since; for|J'apprends le français depuis un an.|I have been learning French for a year.
très|adv||very|C'est très bon.|It's very good.
trop|adv||too; too much|Il y a trop de bruit.|There is too much noise.
assez|adv||enough; fairly|J'ai assez mangé.|I've eaten enough.
beaucoup|adv||a lot; much|Merci beaucoup.|Thank you very much.
peu|adv||little; few|Je parle peu.|I speak little.
déjà|adv||already|Tu as déjà fini ?|Have you finished already?
encore|adv||again; still; yet|Encore un café ?|Another coffee?
toujours|adv||always; still|Il est toujours à l'heure.|He is always on time.
jamais|adv||never; ever|Je ne mange jamais de viande.|I never eat meat.
souvent|adv||often|Nous allons souvent au marché.|We often go to the market.
parfois|adv||sometimes|Parfois, je lis le soir.|Sometimes I read in the evening.
maintenant|adv||now|Maintenant, je comprends.|Now I understand.
aujourd'hui|adv||today|Aujourd'hui, il fait beau.|Today the weather is nice.
demain|adv||tomorrow|À demain !|See you tomorrow!
hier|adv||yesterday|Hier, j'ai travaillé.|Yesterday I worked.
bientôt|adv||soon|À bientôt !|See you soon!
ici|adv||here|Viens ici.|Come here.
là|adv||there; here|Je suis là.|I'm here.
partout|adv||everywhere|Il y a des fleurs partout.|There are flowers everywhere.
vraiment|adv||really|C'est vraiment difficile.|It's really difficult.
peut-être|adv||maybe, perhaps|Peut-être demain.|Maybe tomorrow.
bien|adv||well; good|Tu parles bien.|You speak well.
mal|adv||badly|Il dort mal.|He sleeps badly.
plus|adv||more|Je veux plus de temps.|I want more time.
moins|adv||less|Il y a moins de monde.|There are fewer people.
aussi|adv||also; too|Moi aussi.|Me too.
ensemble|adv||together|Travaillons ensemble.|Let's work together.
seulement|adv||only|J'ai seulement dix minutes.|I only have ten minutes.
oui|intj||yes|Oui, bien sûr.|Yes, of course.
non|intj||no|Non, merci.|No, thank you.
merci|intj||thank you|Merci pour ton aide.|Thanks for your help.
bonjour|intj||hello; good morning|Bonjour, madame.|Hello, madam.
bonsoir|intj||good evening|Bonsoir, tout le monde.|Good evening, everyone.
salut|intj||hi; bye (informal)|Salut, ça va ?|Hi, how's it going?
au revoir|intj||goodbye|Au revoir, à demain.|Goodbye, see you tomorrow.
s'il vous plaît|intj||please (formal)|Un café, s'il vous plaît.|A coffee, please.
excusez-moi|intj||excuse me|Excusez-moi, où est la gare ?|Excuse me, where is the station?
d'accord|intj||okay; agreed|D'accord, on se retrouve à huit heures.|Okay, let's meet at eight.
être|verb||to be|Nous sommes contents.|We are happy.
avoir|verb||to have|J'ai deux sœurs.|I have two sisters.
aller|verb||to go|Je vais au travail à pied.|I walk to work.
faire|verb||to do; to make|Qu'est-ce que tu fais ?|What are you doing?
dire|verb||to say; to tell|Elle dit la vérité.|She tells the truth.
pouvoir|verb||to be able to; can|Je peux t'aider.|I can help you.
vouloir|verb||to want|Il veut un verre d'eau.|He wants a glass of water.
savoir|verb||to know (a fact; how to)|Je ne sais pas.|I don't know.
connaître|verb||to know (a person or place)|Tu connais ce restaurant ?|Do you know this restaurant?
devoir|verb||to have to; must; to owe|Je dois partir.|I have to leave.
voir|verb||to see|Je vois la mer.|I can see the sea.
venir|verb||to come|Tu viens ce soir ?|Are you coming tonight?
prendre|verb||to take; to have (food, drink)|Je prends un café.|I'll have a coffee.
donner|verb||to give|Donne-moi ton numéro.|Give me your number.
parler|verb||to speak; to talk|Nous parlons français.|We speak French.
aimer|verb||to like; to love|J'aime la musique.|I like music.
manger|verb||to eat|Ils mangent à midi.|They eat at noon.
boire|verb||to drink|Elle boit de l'eau.|She drinks water.
habiter|verb||to live (reside)|J'habite en ville.|I live in town.
travailler|verb||to work|Il travaille le matin.|He works in the morning.
comprendre|verb||to understand|Je ne comprends pas.|I don't understand.
penser|verb||to think|Je pense que c'est vrai.|I think it's true.
croire|verb||to believe|Je crois que oui.|I believe so.
trouver|verb||to find; to think (opinion)|Je trouve ça intéressant.|I find that interesting.
chercher|verb||to look for|Je cherche mes clés.|I'm looking for my keys.
attendre|verb||to wait (for)|Attends-moi ici.|Wait for me here.
finir|verb||to finish|J'ai fini mon travail.|I have finished my work.
commencer|verb||to begin, to start|Le cours commence à neuf heures.|The class starts at nine.
mettre|verb||to put; to put on|Mets ton manteau.|Put your coat on.
partir|verb||to leave; to go away|Le train part à midi.|The train leaves at noon.
sortir|verb||to go out; to take out|On sort ce soir ?|Shall we go out tonight?
entrer|verb||to enter, to go in|Entrez, s'il vous plaît.|Come in, please.
rester|verb||to stay, to remain|Je reste à la maison.|I'm staying at home.
passer|verb||to pass; to spend (time)|Elle passe ses vacances en France.|She spends her holidays in France.
appeler|verb||to call|Je t'appelle demain.|I'll call you tomorrow.
demander|verb||to ask|Je demande son nom.|I ask for his name.
répondre|verb||to answer, to reply|Réponds à ma question.|Answer my question.
écrire|verb||to write|J'écris un message.|I'm writing a message.
lire|verb||to read|Elle lit un journal.|She reads a newspaper.
écouter|verb||to listen (to)|J'écoute la radio.|I listen to the radio.
regarder|verb||to watch; to look at|On regarde un film.|We're watching a film.
entendre|verb||to hear|Je n'entends rien.|I can't hear anything.
jouer|verb||to play|Les enfants jouent dehors.|The children play outside.
apprendre|verb||to learn|J'apprends le français.|I am learning French.
acheter|verb||to buy|Il achète du pain.|He buys bread.
payer|verb||to pay|Je paie par carte.|I pay by card.
ouvrir|verb||to open|Ouvre la fenêtre.|Open the window.
fermer|verb||to close|Ferme la porte.|Close the door.
dormir|verb||to sleep|Le bébé dort.|The baby is sleeping.
vivre|verb||to live (be alive)|Ils vivent heureux.|They live happily.
rencontrer|verb||to meet (for the first time)|J'ai rencontré ta sœur.|I met your sister.
répéter|verb||to repeat; to rehearse|Pouvez-vous répéter ?|Can you repeat that?
oublier|verb||to forget|N'oublie pas ton passeport.|Don't forget your passport.
s'appeler|verb||to be called|Je m'appelle Claire.|My name is Claire.
homme|noun|m|man|Cet homme est grand.|That man is tall.
femme|noun|f|woman; wife|Cette femme est médecin.|That woman is a doctor.
enfant|noun|mf|child|L'enfant dort.|The child is sleeping.
ami|noun|m|friend (male; "amie" = female)|C'est mon meilleur ami.|He's my best friend.
famille|noun|f|family|Ma famille est grande.|My family is big.
mère|noun|f|mother|Ma mère cuisine bien.|My mother cooks well.
père|noun|m|father|Mon père lit le journal.|My father reads the newspaper.
frère|noun|m|brother|J'ai un petit frère.|I have a little brother.
sœur|noun|f|sister|Ma sœur étudie.|My sister is studying.
maison|noun|f|house; home|Nous rentrons à la maison.|We are going home.
appartement|noun|m|apartment, flat|Leur appartement est petit.|Their flat is small.
ville|noun|f|city, town|J'aime cette ville.|I like this city.
rue|noun|f|street|La rue est calme.|The street is quiet.
pays|noun|m|country|Quel est ton pays ?|What is your country?
école|noun|f|school|L'école ouvre à huit heures.|School opens at eight.
travail|noun|m|work; job|Le travail commence tôt.|Work starts early.
bureau|noun|m|office; desk|Je suis au bureau.|I am at the office.
jour|noun|m|day|Quel jour sommes-nous ?|What day is it?
semaine|noun|f|week|La semaine prochaine, je voyage.|Next week I'm travelling.
mois|noun|m|month|Ce mois-ci, j'étudie beaucoup.|This month I'm studying a lot.
année|noun|f|year (as a duration)|Cette année, je veux progresser.|This year I want to improve.
an|noun|m|year (in counting: "deux ans")|Elle a vingt ans.|She is twenty years old.
heure|noun|f|hour; time of day|Quelle heure est-il ?|What time is it?
minute|noun|f|minute|Attends une minute.|Wait a minute.
temps|noun|m|time; weather|Je n'ai pas le temps.|I don't have time.
matin|noun|m|morning|Le matin, je lis.|In the morning I read.
soir|noun|m|evening|Ce soir, on sort.|Tonight we're going out.
nuit|noun|f|night|Bonne nuit !|Good night!
eau|noun|f|water|Un verre d'eau, s'il vous plaît.|A glass of water, please.
pain|noun|m|bread|Le pain est frais.|The bread is fresh.
fromage|noun|m|cheese|J'adore le fromage.|I love cheese.
viande|noun|f|meat|Elle ne mange pas de viande.|She doesn't eat meat.
légume|noun|m|vegetable|Mange tes légumes.|Eat your vegetables.
fruit|noun|m|fruit|Je prends un fruit.|I'll have a piece of fruit.
café|noun|m|coffee; café|Un café, s'il vous plaît.|A coffee, please.
thé|noun|m|tea|Il boit du thé.|He drinks tea.
lait|noun|m|milk|Du lait dans le café ?|Milk in your coffee?
repas|noun|m|meal|Le repas est prêt.|The meal is ready.
petit déjeuner|noun|m|breakfast|Le petit déjeuner est à sept heures.|Breakfast is at seven.
déjeuner|noun|m|lunch|On se voit pour le déjeuner.|Let's meet for lunch.
dîner|noun|m|dinner|Le dîner est à huit heures.|Dinner is at eight.
argent|noun|m|money; silver|Je n'ai pas d'argent.|I have no money.
prix|noun|m|price; prize|Quel est le prix ?|What is the price?
billet|noun|m|ticket; banknote|Je prends deux billets.|I'll take two tickets.
voiture|noun|f|car|Sa voiture est rouge.|His car is red.
train|noun|m|train|Le train est en retard.|The train is late.
avion|noun|m|plane|L'avion décolle à six heures.|The plane takes off at six.
gare|noun|f|train station|La gare est près d'ici.|The station is near here.
aéroport|noun|m|airport|Je vais à l'aéroport.|I'm going to the airport.
hôtel|noun|m|hotel|L'hôtel est confortable.|The hotel is comfortable.
restaurant|noun|m|restaurant|Ce restaurant est excellent.|This restaurant is excellent.
magasin|noun|m|shop, store|Le magasin ferme à sept heures.|The shop closes at seven.
marché|noun|m|market|Je vais au marché le samedi.|I go to the market on Saturdays.
livre|noun|m|book|Je lis un bon livre.|I'm reading a good book.
journal|noun|m|newspaper; journal|Il lit le journal.|He reads the newspaper.
film|noun|m|film, movie|J'ai vu un film hier.|I saw a film yesterday.
musique|noun|f|music|J'écoute de la musique.|I listen to music.
langue|noun|f|language; tongue|Le français est une belle langue.|French is a beautiful language.
mot|noun|m|word|Je cherche un mot.|I'm looking for a word.
phrase|noun|f|sentence|Écris une phrase simple.|Write a simple sentence.
question|noun|f|question|J'ai une question.|I have a question.
réponse|noun|f|answer|Quelle est la réponse ?|What is the answer?
problème|noun|m|problem|Il n'y a pas de problème.|There is no problem.
idée|noun|f|idea|C'est une bonne idée.|That's a good idea.
chose|noun|f|thing|Il y a beaucoup de choses à voir.|There are many things to see.
personne|noun|f|person|C'est une personne sympa.|She's a nice person.
monde|noun|m|world; people|Il y a beaucoup de monde.|There are lots of people.
vie|noun|f|life|La vie est belle.|Life is beautiful.
main|noun|f|hand|Lave-toi les mains.|Wash your hands.
tête|noun|f|head|J'ai mal à la tête.|I have a headache.
cœur|noun|m|heart|Elle a bon cœur.|She has a good heart.
nom|noun|m|name; noun|Quel est ton nom ?|What is your name?
numéro|noun|m|number (of a phone, house…)|Donne-moi ton numéro.|Give me your number.
chat|noun|m|cat|Le chat dort sur le canapé.|The cat is sleeping on the sofa.
chien|noun|m|dog|Mon chien aime courir.|My dog likes to run.
fenêtre|noun|f|window|Ouvre la fenêtre.|Open the window.
porte|noun|f|door|La porte est fermée.|The door is closed.
table|noun|f|table|Réserver une table pour deux.|To book a table for two.
chambre|noun|f|bedroom; room|Ma chambre est au premier étage.|My room is on the first floor.
cuisine|noun|f|kitchen; cooking|Je suis dans la cuisine.|I'm in the kitchen.
téléphone|noun|m|phone|Mon téléphone est en panne.|My phone is broken.
ordinateur|noun|m|computer|Il travaille sur son ordinateur.|He works on his computer.
médecin|noun|m|doctor|Je vais chez le médecin.|I'm going to the doctor.
rendez-vous|noun|m|appointment; date; meeting|J'ai un rendez-vous à dix heures.|I have an appointment at ten.
santé|noun|f|health|À votre santé !|Cheers! (to your health)
vacances|noun|f|holidays, vacation (plural)|Nous partons en vacances.|We are going on holiday.
fête|noun|f|party; holiday|On fait une fête samedi.|We're having a party on Saturday.
grand|adj||big; tall; great (f. grande)|Il est très grand.|He is very tall.
petit|adj||small; short (f. petite)|C'est une petite ville.|It's a small town.
bon|adj||good (f. bonne)|Ce gâteau est très bon.|This cake is very good.
mauvais|adj||bad (f. mauvaise)|Il fait mauvais aujourd'hui.|The weather is bad today.
beau|adj||beautiful; nice (f. belle)|Il fait beau.|The weather is nice.
nouveau|adj||new (f. nouvelle)|J'ai un nouveau travail.|I have a new job.
vieux|adj||old (f. vieille)|C'est un vieux livre.|It's an old book.
jeune|adj||young|Elle est encore jeune.|She is still young.
facile|adj||easy|Cet exercice est facile.|This exercise is easy.
difficile|adj||difficult|Le subjonctif est difficile.|The subjunctive is difficult.
important|adj||important|C'est très important.|It's very important.
content|adj||happy, pleased (f. contente)|Je suis content de te voir.|I'm happy to see you.
fatigué|adj||tired (f. fatiguée)|Je suis fatigué ce soir.|I'm tired tonight.
heureux|adj||happy (f. heureuse)|Ils sont heureux ensemble.|They are happy together.
triste|adj||sad|Pourquoi es-tu triste ?|Why are you sad?
prêt|adj||ready (f. prête)|Tu es prêt ?|Are you ready?
occupé|adj||busy (f. occupée)|Je suis très occupé.|I'm very busy.
chaud|adj||hot, warm (f. chaude)|Le café est chaud.|The coffee is hot.
froid|adj||cold (f. froide)|Il fait froid ce matin.|It's cold this morning.
cher|adj||expensive; dear (f. chère)|C'est trop cher.|It's too expensive.
libre|adj||free; available|Tu es libre demain ?|Are you free tomorrow?
ouvert|adj||open (f. ouverte)|Le magasin est ouvert.|The shop is open.
fermé|adj||closed (f. fermée)|Le musée est fermé le lundi.|The museum is closed on Mondays.
vrai|adj||true (f. vraie)|Ce n'est pas vrai !|That's not true!
faux|adj||false; wrong (f. fausse)|La réponse est fausse.|The answer is wrong.
premier|adj||first (f. première)|C'est mon premier jour.|It's my first day.
dernier|adj||last (f. dernière)|Le dernier train part à minuit.|The last train leaves at midnight.
même|adj||same; even|On a le même âge.|We are the same age.
autre|adj||other|Je préfère l'autre.|I prefer the other one.
seul|adj||alone; only (f. seule)|Je suis seul ce soir.|I'm alone tonight.
gentil|adj||kind, nice (f. gentille)|Tu es très gentil.|You are very kind.
intéressant|adj||interesting (f. intéressante)|Ce livre est intéressant.|This book is interesting.
désolé|adj||sorry (f. désolée)|Désolé, je suis en retard.|Sorry, I'm late.
`;

export interface Word { w: string; p: string; g: string; en: string; fr: string; fe: string }
export const WORDS: Word[] = RAW.trim().split("\n").map((l) => {
  const [w = "", p = "", g = "", en = "", fr = "", fe = ""] = l.split("|");
  return { w, p, g, en, fr, fe };
});
