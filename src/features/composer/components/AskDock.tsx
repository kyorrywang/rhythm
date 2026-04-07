import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleSlash2, MessageSquareQuote } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { AskQuestion } from '@/shared/types/schema';
import type { AskDockProps } from '../types';

type AnswerState = {
  text: string;
  options: string[];
};

export const AskDock = ({
  currentAsk,
  selectedAskOptions,
  onOptionToggle,
  onResetOptions,
  onSubmit,
  onIgnore,
}: Omit<AskDockProps, 'isSubmitDisabled' | 'isMinimized' | 'onToggleMinimize' | 'text' | 'setText'> & { onIgnore?: () => void }) => {
  const questions = useMemo<AskQuestion[]>(() => {
    if (currentAsk.questions && currentAsk.questions.length > 0) {
      return currentAsk.questions;
    }
    return [{
      question: currentAsk.question,
      options: currentAsk.options,
      selectionType: currentAsk.selectionType,
    }];
  }, [currentAsk]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({});
  const currentQuestion = questions[currentIndex];
  const currentAnswer = answers[currentIndex] || { text: '', options: selectedAskOptions };
  const isSingle = currentQuestion.selectionType === 'single_with_input';
  const isLast = currentIndex === questions.length - 1;
  const title = currentAsk.title.trim();

  useEffect(() => {
    setCurrentIndex(0);
    setAnswers({});
    onResetOptions();
  }, [currentAsk.toolId, onResetOptions]);

  const setCurrentAnswer = (next: AnswerState) => {
    setAnswers((prev) => ({ ...prev, [currentIndex]: next }));
  };

  const handleOptionClick = (option: string) => {
    const nextOptions = isSingle
      ? [option]
      : currentAnswer.options.includes(option)
        ? currentAnswer.options.filter((item) => item !== option)
        : [...currentAnswer.options, option];

    onResetOptions();
    nextOptions.forEach((item) => onOptionToggle(item));
    setCurrentAnswer({ ...currentAnswer, options: nextOptions });
  };

  const handlePrevious = () => {
    if (currentIndex === 0) return;
    onResetOptions();
    setCurrentIndex((value) => value - 1);
  };

  const handleNext = () => {
    if (!isLast) {
      onResetOptions();
      setCurrentIndex((value) => value + 1);
      return;
    }

    const normalized = questions.map((question, index) => ({
      question: question.question,
      text: answers[index]?.text?.trim() || '',
      options: answers[index]?.options || [],
    }));

    const answer = normalized
      .map((item, index) => {
        const selected = item.options.join(', ');
        const detail = item.text;
        const body = [selected, detail].filter(Boolean).join(' | ');
        return questions.length > 1 ? `${index + 1}. ${item.question}: ${body || '已忽略'}` : body;
      })
      .filter(Boolean)
      .join('\n');

    onSubmit({
      answer,
      record: {
        selected: Array.from(new Set(normalized.flatMap((item) => item.options))),
        text: answer,
      },
    });
  };

  const isDisabled = currentAnswer.options.length === 0 && currentAnswer.text.trim().length === 0;

  return (
    <div className="relative z-20 mx-auto w-full max-w-[808px] px-6 pb-6 pointer-events-auto">
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        <div className="border-b border-slate-100 bg-[linear-gradient(180deg,#fffdfa_0%,#f8f4ee_100%)] px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[13px] font-medium text-slate-800">
              <MessageSquareQuote size={15} className="text-amber-700" />
              <span>{title}</span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
                第 {currentIndex + 1} / {questions.length} 题
              </span>
            </div>
            <div className="text-[12px] text-slate-500">
              {isSingle ? '单选 + 补充输入' : '多选 + 补充输入'}
            </div>
          </div>
          <div className="mt-3 flex gap-1.5">
            {questions.map((_, index) => (
              <div
                key={index}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  index <= currentIndex ? 'bg-amber-500' : 'bg-slate-200',
                )}
              />
            ))}
          </div>
        </div>

        <div className="px-5 py-5">
          <h3 className="text-[16px] font-medium leading-7 text-slate-900">{currentQuestion.question}</h3>

          <div className="mt-4 grid gap-2">
            {currentQuestion.options.map((option) => {
              const selected = currentAnswer.options.includes(option);
              return (
                <button
                  key={option}
                  onClick={() => handleOptionClick(option)}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[14px] transition-colors',
                    selected
                      ? 'border-amber-400 bg-amber-50 text-amber-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center border transition-colors',
                      isSingle ? 'rounded-full' : 'rounded-[5px]',
                      selected ? 'border-amber-500 bg-amber-500' : 'border-slate-300 bg-white',
                    )}
                  >
                    {selected && (
                      <span
                        className={cn(
                          'bg-white',
                          isSingle ? 'h-1.5 w-1.5 rounded-full' : 'h-2 w-2 rounded-[2px]',
                        )}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">{option}</span>
                </button>
              );
            })}
          </div>

          <textarea
            value={currentAnswer.text}
            onChange={(event) => setCurrentAnswer({ ...currentAnswer, text: event.target.value })}
            placeholder="可补充说明，也可以只选择选项。"
            className="mt-4 min-h-[92px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[14px] leading-7 text-slate-800 outline-none transition-colors focus:border-amber-300 focus:bg-white"
          />
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-[#fbfaf8] px-5 py-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] text-slate-500 transition-colors hover:bg-white hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft size={13} />
              上一步
            </button>
            {onIgnore && (
              <button
                onClick={onIgnore}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] text-slate-400 transition-colors hover:bg-white hover:text-red-500"
              >
                <CircleSlash2 size={13} />
                忽略
              </button>
            )}
          </div>

          <button
            onClick={handleNext}
            disabled={isDisabled}
            className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isLast ? '提交答案' : '下一题'}
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
