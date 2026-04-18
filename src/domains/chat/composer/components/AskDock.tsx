import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleSlash2, MessageSquareQuote } from 'lucide-react';
import { cn } from '@/shared/utils/utils';
import { themeRecipes } from '@/ui/theme/recipes';
import { Button } from '@/ui/components/Button';
import type { AskQuestion, AskResponse } from '@/shared/types/schema';
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
      id: 'question-1',
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
      id: question.id,
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

    const record: AskResponse = {
      answers: normalized.map((item) => ({
        questionId: item.id,
        selected: item.options,
        text: item.text,
      })),
    };

    onSubmit({
      answer,
      record,
    });
  };

  const isDisabled = currentAnswer.options.length === 0 && currentAnswer.text.trim().length === 0;

  return (
    <div className="relative z-20 mx-auto w-full max-w-[868px] px-6 pb-6 pointer-events-auto">
      <div className={`overflow-hidden ${themeRecipes.workbenchSurface()}`}>
        <div className="border-b-[var(--theme-divider-width)] border-[var(--theme-border)] bg-[linear-gradient(180deg,var(--theme-surface)_0%,var(--theme-panel-bg)_100%)] px-[var(--theme-panel-padding-x)] py-[var(--theme-panel-padding-y)]">
          <div className="flex items-center justify-between gap-[var(--theme-section-gap)]">
            <div className={`flex items-center gap-[var(--theme-toolbar-gap)] ${themeRecipes.sectionTitle()}`}>
              <MessageSquareQuote size={15} className="text-[var(--theme-warning-text)]" />
              <span>{title}</span>
              <span className={themeRecipes.badge('warning')}>
                第 {currentIndex + 1} / {questions.length} 题
              </span>
            </div>
            <div className={`text-[length:var(--theme-meta-size)] ${themeRecipes.description()}`}>
              {isSingle ? '单选 + 补充输入' : '多选 + 补充输入'}
            </div>
          </div>
          <div className="mt-[var(--theme-toolbar-gap)] flex gap-[calc(var(--theme-toolbar-gap)*0.5)]">
            {questions.map((_, index) => (
              <div
                key={index}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  index <= currentIndex ? 'bg-[var(--theme-warning-text)]' : 'bg-[var(--theme-border)]',
                )}
              />
            ))}
          </div>
        </div>

        <div className="px-[var(--theme-panel-padding-x)] py-[var(--theme-panel-padding-y)]">
          <h3 className={`${themeRecipes.title()} leading-7`}>{currentQuestion.question}</h3>

          <div className="mt-[var(--theme-section-gap)] grid gap-[var(--theme-toolbar-gap)]">
            {currentQuestion.options.map((option) => {
              const selected = currentAnswer.options.includes(option);
              return (
                <Button
                  variant="unstyled"
                  size="none"
                  key={option}
                  onClick={() => handleOptionClick(option)}
                  className={cn(
                    'flex min-h-[var(--theme-control-height-lg)] items-center gap-[var(--theme-toolbar-gap)] rounded-[var(--theme-radius-card)] border-[var(--theme-border-width)] px-[var(--theme-control-padding-x-md)] text-left text-[length:var(--theme-body-size)] transition-colors',
                    selected
                      ? 'border-[var(--theme-warning-border)] bg-[var(--theme-warning-surface)] text-[var(--theme-warning-text)]'
                      : 'border-[var(--theme-border)] bg-[var(--theme-surface)] text-[var(--theme-text-secondary)] hover:border-[var(--theme-border-strong)] hover:bg-[var(--theme-surface-muted)]',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center border transition-colors',
                      isSingle ? 'rounded-full' : 'rounded-[calc(var(--theme-radius-control)*0.45)]',
                      selected ? 'border-[var(--theme-warning-text)] bg-[var(--theme-warning-text)]' : 'border-[var(--theme-border-strong)] bg-[var(--theme-surface)]',
                    )}
                  >
                    {selected && (
                      <span
                        className={cn(
                          'bg-[var(--theme-surface)]',
                          isSingle ? 'h-1.5 w-1.5 rounded-full' : 'h-2 w-2 rounded-[calc(var(--theme-radius-control)*0.2)]',
                        )}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">{option}</span>
                </Button>
              );
            })}
          </div>

          <textarea
            value={currentAnswer.text}
            onChange={(event) => setCurrentAnswer({ ...currentAnswer, text: event.target.value })}
            placeholder="可补充说明，也可以只选择选项。"
            className={`mt-[var(--theme-section-gap)] w-full resize-none ${themeRecipes.fieldMuted()} ${themeRecipes.textarea()} leading-7 focus:border-[var(--theme-warning-border)] focus:bg-[var(--theme-surface)]`}
          />
        </div>

        <div className="flex items-center justify-between border-t-[var(--theme-divider-width)] border-[var(--theme-border)] bg-[linear-gradient(180deg,var(--theme-panel-bg)_0%,var(--theme-shell-bg)_100%)] px-[var(--theme-panel-padding-x)] py-[calc(var(--theme-panel-padding-y)*0.8)]">
          <div className={themeRecipes.toolbar()}>
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePrevious}
              disabled={currentIndex === 0}
            >
              <ArrowLeft size={13} />
              上一步
            </Button>
            {onIgnore && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onIgnore}
                className="text-[var(--theme-danger-text)] hover:text-[var(--theme-danger)]"
              >
                <CircleSlash2 size={13} />
                忽略
              </Button>
            )}
          </div>

          <Button
            variant="primary"
            size="md"
            onClick={handleNext}
            disabled={isDisabled}
          >
            {isLast ? '提交答案' : '下一题'}
            <ArrowRight size={13} />
          </Button>
        </div>
      </div>
    </div>
  );
};
