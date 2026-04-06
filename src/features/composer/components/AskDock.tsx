import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { AskDockProps } from '../types';
import { useState, useCallback, useMemo } from 'react';
import { AskQuestion } from '@/shared/types/schema';

export const AskDock = ({ currentAsk, text, setText, selectedAskOptions, onOptionToggle, onResetOptions, onSubmit, onIgnore }: Omit<AskDockProps, 'isSubmitDisabled' | 'isMinimized' | 'onToggleMinimize'> & { onIgnore?: () => void }) => {
  const questions = useMemo((): AskQuestion[] => {
    if (currentAsk.questions && currentAsk.questions.length > 0) {
      return currentAsk.questions;
    }
    return [{
      question: currentAsk.question,
      options: currentAsk.options,
      selectionType: currentAsk.selectionType,
    }];
  }, [currentAsk.question, currentAsk.options, currentAsk.selectionType, currentAsk.questions]);

  const isMultiQuestion = questions.length > 1;
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [qAnswers, setQAnswers] = useState<Record<number, { text: string; options: string[] }>>({});

  const currentQ = questions[currentQIndex] || questions[0];
  const selectionType = currentQ.selectionType || 'multiple_with_input';
  const hasOptions = currentQ.options.length > 0;
  const isSingle = selectionType === 'single_with_input';
  const isLastQuestion = currentQIndex === questions.length - 1;

  const currentSelections = qAnswers[currentQIndex]?.options || selectedAskOptions;
  const currentText = qAnswers[currentQIndex]?.text || text;

  const saveCurrentState = useCallback(() => {
    setQAnswers(prev => ({
      ...prev,
      [currentQIndex]: { text, options: selectedAskOptions },
    }));
  }, [currentQIndex, text, selectedAskOptions]);

  const loadQuestionState = useCallback((index: number) => {
    const saved = qAnswers[index];
    if (saved) {
      setText(saved.text);
      onResetOptions();
      saved.options.forEach(opt => onOptionToggle(opt));
    } else {
      setText('');
      onResetOptions();
    }
  }, [qAnswers, setText, onOptionToggle, onResetOptions]);

  const buildSubmission = useCallback(() => {
    const finalAnswers: Array<{ question: string; text: string; options: string[] }> = questions.map((question, index) => {
      if (index === currentQIndex) {
        return {
          question: question.question,
          text: text.trim(),
          options: [...selectedAskOptions],
        };
      }
      const saved = qAnswers[index] || { text: '', options: [] };
      return {
        question: question.question,
        text: saved.text.trim(),
        options: [...saved.options],
      };
    });

    const combinedSelected = Array.from(new Set(finalAnswers.flatMap((entry) => entry.options)));
    const combinedText = finalAnswers
      .map((entry, index) => {
        const selected = entry.options.join(', ');
        const detail = entry.text;
        const body = [selected, detail].filter(Boolean).join(': ');
        return questions.length > 1 ? `${index + 1}. ${entry.question} => ${body}` : body;
      })
      .filter(Boolean)
      .join('\n');

    return {
      answer: combinedText,
      record: {
        selected: combinedSelected,
        text: combinedText,
      },
    };
  }, [questions, currentQIndex, text, selectedAskOptions, qAnswers]);

  const handleNext = useCallback(() => {
    saveCurrentState();
    if (isLastQuestion) {
      onSubmit(buildSubmission());
    } else {
      setCurrentQIndex(prev => prev + 1);
      setTimeout(() => loadQuestionState(currentQIndex + 1), 0);
    }
  }, [saveCurrentState, isLastQuestion, onSubmit, currentQIndex, loadQuestionState, buildSubmission]);

  const handleBack = useCallback(() => {
    saveCurrentState();
    if (currentQIndex > 0) {
      setCurrentQIndex(prev => prev - 1);
      setTimeout(() => loadQuestionState(currentQIndex - 1), 0);
    }
  }, [saveCurrentState, currentQIndex, loadQuestionState]);

  const handleOptionToggle = useCallback((opt: string) => {
    if (opt === '__RESET__') {
      onOptionToggle('__RESET__');
      return;
    }
    onOptionToggle(opt);
  }, [onOptionToggle]);

  const isCurrentDisabled = useMemo((): boolean => {
    const hasInput = currentText.trim().length > 0;
    const hasSelection = currentSelections.length > 0;
    switch (selectionType) {
      case 'single_with_input':
      case 'multiple_with_input':
        return !hasSelection && !hasInput;
      default:
        return false;
    }
  }, [selectionType, currentText, currentSelections]);

  const placeholderText = hasOptions ? '选择选项或补充说明...' : '请输入您的回答...';

  const headerLabel = '请选择或补充说明';

  return (
    <div className="w-full max-w-[700px] mx-auto pb-6 relative z-20 pointer-events-auto">
      <div className="bg-white border text-left border-gray-200 rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {isMultiQuestion && (
              <span className="text-[11px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
                问题 {currentQIndex + 1}/{questions.length}
              </span>
            )}
            <span className="text-[13px] font-medium text-gray-800">{headerLabel}</span>
            {hasOptions && (
              <span className="text-[11px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                {isSingle ? '单选' : '多选'}
              </span>
            )}
          </div>
        </div>

        {isMultiQuestion && (
          <div className="px-4 pt-3">
            <div className="flex gap-1">
              {questions.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors",
                    i <= currentQIndex ? "bg-blue-500" : "bg-gray-200"
                  )}
                />
              ))}
            </div>
          </div>
        )}

        <div className="p-4">
          <div className="mb-4">
            <h3 className="text-[14px] font-medium text-gray-800">{currentQ.question}</h3>
          </div>

          {hasOptions && (
            <div className="space-y-2">
              {currentQ.options.map((opt, i) => {
                const isSelected = currentSelections.includes(opt);
                return (
                  <div 
                    key={i} 
                    onClick={() => handleOptionToggle(opt)}
                    className={cn(
                      "flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors",
                      isSelected ? "border-blue-500 bg-blue-50/30" : "border-gray-200 hover:border-blue-300"
                    )}
                  >
                    <div className={cn(
                      "mt-0.5 w-4 h-4 flex-shrink-0 flex items-center justify-center",
                      isSingle ? "rounded-full border-2" : "rounded border",
                      isSelected ? "border-blue-500 bg-blue-500" : "border-gray-300 bg-white"
                    )}>
                      {isSingle ? (
                        isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full" />
                      ) : (
                        isSelected && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M9 12l2 2 4-4"/></svg>
                      )}
                    </div>
                    <div className="text-[14px] text-gray-800">{opt}</div>
                  </div>
                );
              })}
            </div>
          )}

          <div className={cn(hasOptions && "mt-4")}>
            <textarea
              value={currentText}
              onChange={(e) => {
                setText(e.target.value);
                setQAnswers(prev => ({
                  ...prev,
                  [currentQIndex]: { ...(prev[currentQIndex] || { options: selectedAskOptions }), text: e.target.value },
                }));
              }}
              placeholder={placeholderText}
              className="w-full resize-none border border-gray-200 rounded-lg p-3 text-[14px] outline-none focus:border-blue-300 min-h-[60px]"
            />
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3 bg-[#fbfbfb] border-t border-gray-100">
          <div className="flex items-center gap-2">
            {currentQIndex > 0 && (
              <button 
                onClick={handleBack}
                className="px-3 py-1.5 text-[13px] text-gray-600 hover:text-gray-800 transition-colors flex items-center gap-1"
              >
                <ArrowLeft size={13} /> 上一步
              </button>
            )}
            {onIgnore && (
              <button 
                onClick={onIgnore}
                className="px-3 py-1.5 text-[13px] text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1"
              >
                <X size={13} /> 忽略
              </button>
            )}
          </div>
          <button 
            onClick={handleNext} 
            disabled={isCurrentDisabled}
            className="px-4 py-1.5 bg-[#1f1f1f] hover:bg-black disabled:opacity-50 text-white text-[13px] rounded-md transition-colors flex items-center gap-1"
          >
            {isLastQuestion ? '提交' : '下一步'} <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
