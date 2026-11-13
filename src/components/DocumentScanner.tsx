import { useRef, useState, type FormEvent, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Clipboard, FileText, Heart, Info, LoaderCircle, Upload, X } from 'lucide-react';
import LogoBadge from '@/components/LogoBadge';

type ReportSummary = {
  simpleSummary: string;
  keyFindings: string[];
  gentleAdvice: string[];
  questionsToAskDoctor: string[];
};

type ReportPart = { text: string } | { inlineData: { mimeType: string; data: string } };

const GEMINI_MODELS = [
  'gemini-4-hydrogen',
  'gemini-flash-lite-latest',
  'gemini-3-flash-preview',
  'gemini-flash-latest',
];

const sampleReport = `POSTPARTUM FOLLOW-UP LAB REPORT (FICTIONAL SAMPLE)
Hemoglobin: 10.8 g/dL (reference range: 12.0-16.0)
Hematocrit: 33% (reference range: 36-46)
Ferritin: 18 ng/mL (reference range: 15-150)
White blood cell count: 7.2 x10^9/L (reference range: 4.0-11.0)
Platelets: 295 x10^9/L (reference range: 150-400)`;

const summaryInstructions = `You are helping a tired postpartum mom understand her report. Use warm, calm, everyday language at about a 6th-grade reading level. Keep sentences short and avoid heavy medical words.

Return only JSON with the keys simpleSummary, keyFindings, gentleAdvice, and questionsToAskDoctor.

For simpleSummary, write exactly 2 short, warm sentences that explain the overall picture in plain words. Be reassuring but honest; do not say everything is fine if a result needs attention or the report is unclear.

For keyFindings, write one short, easy-to-scan item for each important result. Put the plain-English meaning first. Say "Normal" when a result falls within a range shown on the report. For a low result, use clear wording such as "Slightly low — may add to tiredness (hemoglobin 10.8 g/dL)." Keep exact numbers and units brief in parentheses. Do not use phrases like "within the listed reference range." Only compare a result with a range printed in the report; if no range is given, say the report does not list one. Do not guess what caused a symptom.

For gentleAdvice, write 3-4 short, practical, comforting everyday self-care tips that relate directly to the report findings. Use simple 6th-grade language. Keep the tips general and supportive, not medical prescriptions. Do not recommend starting, stopping, or changing medicines or supplements, and do not replace the care team's instructions. If a tip depends on personal health needs, allergies, or diet limits, suggest checking with the care team.

For questionsToAskDoctor, write 2-3 short, natural, conversational questions.

Do not invent results or reference ranges. This is informational only: do not diagnose, prescribe, or claim that a result is safe or dangerous. Explain uncertainty simply and suggest discussing unclear or concerning findings with the care team. Stay warm without minimizing concerns.`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function getSummaryFromResponse(data: unknown): ReportSummary {
  if (!isRecord(data) || !Array.isArray(data.candidates)) {
    throw new Error('Gemini did not return a readable summary. Please try again.');
  }

  const candidate = data.candidates[0];
  if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
    throw new Error('Gemini could not summarize this report. Please try again with a clearer file or text.');
  }

  const textParts: string[] = [];
  for (const part of candidate.content.parts) {
    if (isRecord(part) && typeof part.text === 'string') textParts.push(part.text);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textParts.join('\n'));
  } catch {
    throw new Error('Gemini returned an unreadable summary. Please try again.');
  }

  if (
    !isRecord(parsed) ||
    typeof parsed.simpleSummary !== 'string' ||
    !isStringArray(parsed.keyFindings) ||
    !isStringArray(parsed.gentleAdvice) ||
    !isStringArray(parsed.questionsToAskDoctor)
  ) {
    throw new Error('Gemini returned an incomplete summary. Please try again.');
  }

  return {
    simpleSummary: parsed.simpleSummary,
    keyFindings: parsed.keyFindings,
    gentleAdvice: parsed.gentleAdvice,
    questionsToAskDoctor: parsed.questionsToAskDoctor,
  };
}

function getGoogleApiError(data: unknown, status: number) {
  if (isRecord(data) && isRecord(data.error) && typeof data.error.message === 'string') {
    return data.error.message;
  }
  return `Google API returned HTTP ${status} without an error message.`;
}

async function requestSummary(apiKey: string, parts: ReportPart[]): Promise<ReportSummary> {
  const requestBody = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          simpleSummary: { type: 'STRING' },
          keyFindings: { type: 'ARRAY', items: { type: 'STRING' } },
          gentleAdvice: { type: 'ARRAY', items: { type: 'STRING' } },
          questionsToAskDoctor: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['simpleSummary', 'keyFindings', 'gentleAdvice', 'questionsToAskDoctor'],
      },
    },
  });
  const retryErrors: string[] = [];

  for (const [index, model] of GEMINI_MODELS.entries()) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      },
    );

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (response.ok) return getSummaryFromResponse(data);

    const message = `${model} (HTTP ${response.status}): ${getGoogleApiError(data, response.status)}`;
    if ([404, 429, 503].includes(response.status)) {
      retryErrors.push(message);
      if (index < GEMINI_MODELS.length - 1) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
      }
      continue;
    }

    throw new Error(message);
  }

  throw new Error(`All Gemini model attempts failed. ${retryErrors.join(' | ')}`);
}

function getSummaryText(summary: ReportSummary) {
  return [
    'Simple Summary',
    summary.simpleSummary,
    '',
    'Key Findings',
    ...summary.keyFindings.map((finding) => `- ${finding}`),
    '',
    'Gentle Advice',
    ...summary.gentleAdvice.map((tip) => `- ${tip}`),
    '',
    'Questions to Ask Your Doctor',
    ...summary.questionsToAskDoctor.map((question) => `- ${question}`),
  ].join('\n');
}

function readPdfAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('We could not read that PDF. Please try another file.'));
        return;
      }

      const prefix = 'data:application/pdf;base64,';
      if (!reader.result.startsWith(prefix)) {
        reject(new Error('We could not read that PDF. Please try another file.'));
        return;
      }

      resolve(reader.result.slice(prefix.length));
    };
    reader.onerror = () => reject(new Error('We could not read that PDF. Please try another file.'));
    reader.readAsDataURL(new Blob([file], { type: 'application/pdf' }));
  });
}

export default function DocumentScanner() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'paste' | 'upload'>('paste');
  const [reportText, setReportText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    setError('');
    setSummary(null);
    setCopyMessage('');

    if (file && !/\.(txt|pdf)$/i.test(file.name)) {
      setSelectedFile(null);
      setError('Please choose a .txt or .pdf file.');
      event.currentTarget.value = '';
      return;
    }

    setSelectedFile(file);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setError('');
    setSummary(null);
    setCopyMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSimplify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setCopyMessage('');
    setSummary(null);

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim();
    if (!apiKey) {
      setError('The Gemini API key is missing. Add VITE_GEMINI_API_KEY to your local environment and restart the app.');
      return;
    }

    if (activeTab === 'paste' && !reportText.trim()) {
      setError('Paste your report text or try the sample report to get started.');
      return;
    }

    if (activeTab === 'upload' && !selectedFile) {
      setError('Choose a .txt or .pdf report to continue.');
      return;
    }

    setIsLoading(true);
    try {
      const parts: ReportPart[] = [{ text: summaryInstructions }];

      if (activeTab === 'paste') {
        parts.push({ text: `\n\nReport:\n${reportText.trim()}` });
      } else if (selectedFile?.name.toLowerCase().endsWith('.pdf')) {
        parts.push({ inlineData: { mimeType: 'application/pdf', data: await readPdfAsBase64(selectedFile) } });
      } else if (selectedFile) {
        const text = await selectedFile.text();
        if (!text.trim()) throw new Error('That text file is empty. Choose another file or paste the report text.');
        parts.push({ text: `\n\nReport:\n${text.trim()}` });
      }

      setSummary(await requestSummary(apiKey, parts));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Something went wrong while simplifying the report. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopySummary = async () => {
    if (!summary) return;

    try {
      await navigator.clipboard.writeText(getSummaryText(summary));
      setCopyMessage('Summary copied.');
    } catch {
      setCopyMessage('Unable to copy automatically. You can select the summary text and copy it.');
    }
  };

  const tabClass = (isActive: boolean) =>
    `flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76] ${
      isActive ? 'bg-white text-[#c97b76] shadow-sm' : 'text-[#6b655d] hover:text-[#c97b76]'
    }`;
  const hasInput = activeTab === 'paste' ? Boolean(reportText.trim()) : selectedFile !== null;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#fbf5f0]">
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#f3d4cb] opacity-50 blur-3xl pp-float" />
      <div className="pointer-events-none absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-[#cdd9c5] opacity-40 blur-3xl pp-float-slow" />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-12">
        <LogoBadge className="h-12" />
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 rounded-full border border-[#d8ccc2] bg-white/80 px-4 py-2.5 text-sm font-medium text-[#4a4540] backdrop-blur transition-colors hover:border-[#c97b76] hover:text-[#c97b76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76]"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.7} />
          Back to dashboard
        </button>
      </header>

      <main className="relative z-10 px-6 pb-16 pt-6 sm:px-12">
        <div className="mx-auto max-w-3xl">
          <section className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#e8a5a0]/40 bg-white/70 px-4 py-1.5 text-xs font-medium tracking-wide text-[#c97b76] backdrop-blur">
              <FileText className="h-3.5 w-3.5" />
              A little clarity for your care
            </span>
            <h1 className="font-display mt-5 text-3xl font-medium leading-tight tracking-tight text-[#4a4540] sm:text-5xl">
              AI Document Scanner
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base font-light leading-relaxed text-[#6b655d]">
              Turn medical report language into a clearer starting point for a conversation with your care team.
            </p>
          </section>

          <form onSubmit={handleSimplify} className="mt-9 rounded-2xl border border-[#e9ded5] bg-white/75 p-5 shadow-sm backdrop-blur sm:p-8">
            <div className="mb-5 flex rounded-full bg-[#f7e8e0]/70 p-1" role="tablist" aria-label="Report input method">
              <button
                type="button"
                role="tab"
                id="paste-tab"
                aria-selected={activeTab === 'paste'}
                aria-controls="paste-panel"
                onClick={() => setActiveTab('paste')}
                className={tabClass(activeTab === 'paste')}
              >
                Paste Report Text
              </button>
              <button
                type="button"
                role="tab"
                id="upload-tab"
                aria-selected={activeTab === 'upload'}
                aria-controls="upload-panel"
                onClick={() => setActiveTab('upload')}
                className={tabClass(activeTab === 'upload')}
              >
                Upload File
              </button>
            </div>

            {activeTab === 'paste' ? (
              <div id="paste-panel" role="tabpanel" aria-labelledby="paste-tab">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="report-text" className="text-sm font-medium text-[#4a4540]">
                    Report text
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setReportText(sampleReport);
                      setError('');
                      setSummary(null);
                      setCopyMessage('');
                    }}
                    className="text-xs font-medium text-[#c97b76] underline decoration-[#e8a5a0]/60 underline-offset-4 transition-colors hover:text-[#a95f5a]"
                  >
                    Try a sample postpartum lab report
                  </button>
                </div>
                <textarea
                  id="report-text"
                  value={reportText}
                  onChange={(event) => {
                    setReportText(event.target.value);
                    setSummary(null);
                    setCopyMessage('');
                  }}
                  rows={9}
                  placeholder="Paste the text from your report here..."
                  className="w-full resize-y rounded-xl border border-[#e9ded5] bg-white/80 px-4 py-3 text-sm leading-relaxed text-[#4a4540] outline-none transition focus:border-[#c97b76] focus:ring-2 focus:ring-[#e8a5a0]/30 placeholder:text-[#a59c92]"
                />
              </div>
            ) : (
              <div id="upload-panel" role="tabpanel" aria-labelledby="upload-tab">
                <div className="flex min-h-52 flex-col justify-center rounded-xl border border-dashed border-[#d8ccc2] bg-white/60 p-5 transition-colors hover:border-[#c97b76]/70">
                  {selectedFile ? (
                    <div className="rounded-xl border border-[#e9ded5] bg-white/85 p-4 shadow-sm" aria-live="polite">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex shrink-0 rounded-xl bg-[#f7e8e0] p-3 text-[#c97b76]">
                          <FileText className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[#4a4540]" title={selectedFile.name}>
                            {selectedFile.name}
                          </p>
                          <p className="mt-1 text-xs font-light text-[#8a8278]">
                            {(selectedFile.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoveFile}
                          aria-label={`Remove ${selectedFile.name}`}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#8a8278] transition-colors hover:bg-[#f7e8e0] hover:text-[#c97b76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76]"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (fileInputRef.current) {
                            fileInputRef.current.value = '';
                            fileInputRef.current.click();
                          }
                        }}
                        className="mt-4 text-xs font-medium text-[#c97b76] underline decoration-[#e8a5a0]/60 underline-offset-4 hover:text-[#a95f5a]"
                      >
                        Choose a different file
                      </button>
                    </div>
                  ) : (
                    <label
                      htmlFor="report-file"
                      className="flex cursor-pointer flex-col items-center justify-center py-4 text-center"
                    >
                      <span className="mb-4 inline-flex rounded-xl bg-[#f7e8e0] p-3 text-[#c97b76]">
                        <Upload className="h-5 w-5" />
                      </span>
                      <span className="text-sm font-medium text-[#4a4540]">Choose a report to upload</span>
                      <span className="mt-2 text-xs font-light text-[#8a8278]">Text (.txt) or PDF (.pdf)</span>
                    </label>
                  )}
                  <input
                    ref={fileInputRef}
                    id="report-file"
                    type="file"
                    accept=".txt,.pdf,text/plain,application/pdf"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </div>
              </div>
            )}

            <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#e8a5a0]/30 bg-[#fff9f5] p-4 text-sm font-light leading-relaxed text-[#6b655d]">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#c97b76]" />
              <p>
                For your privacy, remove names and other identifying details. The report text or file you submit is sent to Google Gemini to create this summary.
              </p>
            </div>

            {error && (
              <p role="alert" className="mt-4 rounded-xl border border-[#c97b76]/30 bg-[#fff4f1] px-4 py-3 text-sm leading-relaxed text-[#9c514c]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading || !hasInput}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#c97b76] px-6 py-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#b96d68] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {isLoading ? 'Simplifying your report...' : 'Simplify Report'}
            </button>

            <p className="mt-4 text-xs font-light leading-relaxed text-[#8a8278]">
              This is an informational summary, not a medical diagnosis or a substitute for advice from your healthcare professional.
            </p>
          </form>

          {summary && (
            <section aria-label="Simplified report" className="mt-7 space-y-4">
              <article className="rounded-2xl border border-[#e9ded5] bg-white/75 p-6 shadow-sm backdrop-blur sm:p-7">
                <h2 className="font-display text-xl font-medium tracking-tight text-[#4a4540]">Simple Summary</h2>
                <p className="mt-3 text-sm font-light leading-relaxed text-[#5e5851]">{summary.simpleSummary}</p>
              </article>

              <article className="rounded-2xl border border-[#e9ded5] bg-white/75 p-6 shadow-sm backdrop-blur sm:p-7">
                <h2 className="font-display text-xl font-medium tracking-tight text-[#4a4540]">Key Findings</h2>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm font-light leading-relaxed text-[#5e5851] marker:text-[#c97b76]">
                  {summary.keyFindings.map((finding, index) => <li key={`${index}-${finding}`}>{finding}</li>)}
                </ul>
              </article>

              <article className="rounded-2xl border border-[#e9ded5] bg-white/75 p-6 shadow-sm backdrop-blur sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="inline-flex rounded-xl bg-[#e8eee3] p-2.5 text-[#78896f]">
                    <Heart className="h-5 w-5" strokeWidth={1.7} />
                  </span>
                  <h2 className="font-display text-xl font-medium tracking-tight text-[#4a4540]">Gentle Advice</h2>
                </div>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm font-light leading-relaxed text-[#5e5851] marker:text-[#78896f]">
                  {summary.gentleAdvice.map((tip, index) => <li key={`${index}-${tip}`}>{tip}</li>)}
                </ul>
              </article>

              <article className="rounded-2xl border border-[#e9ded5] bg-white/75 p-6 shadow-sm backdrop-blur sm:p-7">
                <h2 className="font-display text-xl font-medium tracking-tight text-[#4a4540]">Questions to Ask Your Doctor</h2>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm font-light leading-relaxed text-[#5e5851] marker:text-[#c97b76]">
                  {summary.questionsToAskDoctor.map((question, index) => <li key={`${index}-${question}`}>{question}</li>)}
                </ol>
              </article>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="inline-flex items-center gap-2 rounded-full border border-[#d8ccc2] bg-white/80 px-5 py-2.5 text-sm font-medium text-[#4a4540] transition-colors hover:border-[#c97b76] hover:text-[#c97b76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76]"
                >
                  {copyMessage === 'Summary copied.' ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                  {copyMessage === 'Summary copied.' ? 'Copied' : 'Copy Summary'}
                </button>
                {copyMessage && <span role="status" className="text-xs font-light text-[#6b655d]">{copyMessage}</span>}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
