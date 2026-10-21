export interface TemplateQuestion {
  type: "single_choice" | "multi_choice" | "open_ended";
  text: string;
  options: string[];
  required: boolean;
}

export interface PollTemplate {
  title: string;
  description: string;
  questions: TemplateQuestion[];
}

// Candidate roster for the Makueni MNA race. Edit these names/spellings in the
// builder before publishing, and mirror any changes in the favorability and
// second-choice questions below.
const CANDIDATES = [
  "Hon. Stephen Mule",
  "Munguti",
  "Kamwana",
  "Kathumo",
  "Matheka",
];

const FAVORABILITY_SCALE = [
  "Very favourable",
  "Somewhat favourable",
  "Somewhat unfavourable",
  "Very unfavourable",
  "Haven't heard enough about them",
  "No opinion",
];

const PERFORMANCE_SCALE = ["Good", "Fair", "Poor", "Don't know"];

const favorabilityQuestions: TemplateQuestion[] = CANDIDATES.map((name) => ({
  type: "single_choice",
  text: `What is your overall opinion of ${name}?`,
  options: [...FAVORABILITY_SCALE],
  required: false,
}));

const performanceQuestions: TemplateQuestion[] = [
  "water access",
  "roads and infrastructure",
  "education and bursaries",
  "healthcare",
  "job creation for youth",
].map((issue) => ({
  type: "single_choice",
  text: `How would you rate Hon. Stephen Mule's performance on ${issue}?`,
  options: [...PERFORMANCE_SCALE],
  required: false,
}));

// A scientifically structured constituency opinion poll: screening + likely-voter
// filter, demographic stratification, vote intention with an explicit
// undecided/none option, vote intensity, second choice, favorability, and issue
// salience. Built only from the question types the app supports
// (single_choice, multi_choice, open_ended).
export const ADVANCED_POLL_TEMPLATE: PollTemplate = {
  title: "Makueni Constituency Opinion Poll — 2027 (Advanced)",
  description:
    "Scientifically structured constituency poll: screening, likely-voter filter, demographics for stratification, vote intention (with undecided/none), intensity, second choice, favorability, and issue salience. Edit candidate names and the ward list to match the official IEBC roster before publishing.",
  questions: [
    // ─── Section A · Screening & likely-voter filter ───
    {
      type: "single_choice",
      text: "Are you 18 years or older and a Kenyan citizen?",
      options: ["Yes", "No"],
      required: true,
    },
    {
      type: "single_choice",
      text: "Do you currently live in Makueni Constituency?",
      options: ["Yes", "No"],
      required: true,
    },
    {
      type: "single_choice",
      text: "Are you registered to vote at a polling station within Makueni?",
      options: ["Yes", "No", "Not sure"],
      required: true,
    },
    {
      type: "single_choice",
      text: "How likely are you to vote in the 2027 General Election?",
      options: [
        "Absolutely certain to vote",
        "Very likely",
        "Somewhat likely",
        "Not very likely",
        "Will not vote",
      ],
      required: true,
    },

    // ─── Section B · Demographics (for stratification & weighting) ───
    {
      type: "single_choice",
      text: "Which ward do you live in?",
      options: [
        "Tala",
        "Makueni North",
        "Makueni West",
        "Kyeleni",
        "Kauti",
        "Other / Not sure",
      ],
      required: true,
    },
    {
      type: "single_choice",
      text: "How would you describe where you live?",
      options: ["Urban (town / trading centre)", "Peri-urban", "Rural"],
      required: true,
    },
    {
      type: "single_choice",
      text: "What is your gender?",
      options: ["Male", "Female", "Prefer not to say"],
      required: true,
    },
    {
      type: "single_choice",
      text: "Which age group do you belong to?",
      options: ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"],
      required: true,
    },
    {
      type: "single_choice",
      text: "What is your highest level of education?",
      options: [
        "None / Primary",
        "Secondary",
        "College / TVET",
        "University or higher",
        "Prefer not to say",
      ],
      required: false,
    },
    {
      type: "single_choice",
      text: "What is your main occupation?",
      options: [
        "Farmer / agribusiness",
        "Business / self-employed",
        "Formal employment",
        "Casual worker (mjengo / boda boda)",
        "Student",
        "Unemployed",
        "Other",
      ],
      required: false,
    },

    // ─── Section C · Mood & incumbent assessment ───
    {
      type: "single_choice",
      text: "Generally, do you think things in Makueni are heading in the right or the wrong direction?",
      options: ["Right direction", "Wrong direction", "Mixed / Both", "Don't know"],
      required: false,
    },
    {
      type: "single_choice",
      text: "Do you approve or disapprove of the way Hon. Stephen Mule is performing as your Member of National Assembly?",
      options: [
        "Strongly approve",
        "Somewhat approve",
        "Somewhat disapprove",
        "Strongly disapprove",
        "No opinion",
      ],
      required: false,
    },

    // ─── Section D · Vote intention (primary outcome) ───
    {
      type: "single_choice",
      text: "If the election for Member of National Assembly for Makueni were held today, who would you vote for?",
      options: [
        ...CANDIDATES,
        "Other candidate",
        "Would not vote / None of these",
        "Undecided / Still deciding",
      ],
      required: true,
    },

    // ─── Section E · Vote intensity & switchability ───
    {
      type: "single_choice",
      text: "How certain are you about that choice?",
      options: [
        "Completely certain — will not change",
        "Fairly certain",
        "Might still change my mind",
      ],
      required: false,
    },
    {
      type: "single_choice",
      text: "Is your support more because you are FOR that candidate, or AGAINST the others?",
      options: [
        "Mainly for my candidate",
        "Mainly against the others",
        "Both equally",
      ],
      required: false,
    },

    // ─── Section F · Second choice ───
    {
      type: "single_choice",
      text: "If your first-choice candidate were NOT on the ballot, who would be your second choice?",
      options: [...CANDIDATES, "None of these", "Undecided"],
      required: false,
    },

    // ─── Section G · Candidate favorability ───
    ...favorabilityQuestions,

    // ─── Section H · Issue salience & performance ───
    {
      type: "multi_choice",
      text: "Which are the most important problems you want your next MNA to solve? (Select all that apply)",
      options: [
        "Water",
        "Roads & infrastructure",
        "Healthcare",
        "Education & bursaries",
        "Jobs & youth employment",
        "Agriculture & farm inputs",
        "Cost of living",
        "Corruption & accountability",
        "Insecurity",
        "Electricity",
      ],
      required: false,
    },
    {
      type: "single_choice",
      text: "Which candidate do you trust MOST to handle the issue you care about most?",
      options: [...CANDIDATES, "None of them", "Not sure"],
      required: false,
    },
    ...performanceQuestions,

    // ─── Section I · Information & persuasion ───
    {
      type: "single_choice",
      text: "What is your main source of news and political information?",
      options: [
        "Radio",
        "TV",
        "WhatsApp",
        "Facebook",
        "TikTok / X",
        "Church / chief's baraza",
        "Friends & family",
        "Newspapers",
      ],
      required: false,
    },
    {
      type: "open_ended",
      text: "Is there anything else you would like your next Member of National Assembly to know or prioritise?",
      options: [],
      required: false,
    },
  ],
};
