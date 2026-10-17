import { useMemo, useState, type ReactElement } from "react";
import type { AskQuestionPromptState } from "../chatReducer";
import "./PermissionDialog.css";

export function CursorAskQuestionDialog({
  request,
  onSubmit,
  onCancel,
}: {
  request: AskQuestionPromptState;
  onSubmit: (answers: Array<{ questionId: string; selectedOptionIds: string[] }>) => void;
  onCancel: () => void;
}): ReactElement {
  const initial = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const question of request.questions) {
      map.set(question.id, []);
    }
    return map;
  }, [request.questions]);
  const [selectedByQuestionId, setSelectedByQuestionId] = useState(initial);

  return (
    <div className="ib-permission-backdrop" role="presentation">
      <div className="ib-permission-dialog" role="dialog" aria-modal="true">
        <div className="ib-permission-title">{request.title?.trim() || "Question from agent"}</div>
        <div className="ib-permission-actions" style={{ display: "block" }}>
          {request.questions.map((question) => (
            <div key={question.id} style={{ marginBottom: "0.75rem" }}>
              <div style={{ marginBottom: "0.35rem" }}>{question.prompt}</div>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {question.options.map((option) => {
                  const selected =
                    selectedByQuestionId.get(question.id)?.includes(option.id) ?? false;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className="ib-permission-button"
                      aria-pressed={selected}
                      onClick={() => {
                        setSelectedByQuestionId((prev) => {
                          const next = new Map(prev);
                          const current = next.get(question.id) ?? [];
                          if (question.allowMultiple === true) {
                            next.set(
                              question.id,
                              selected
                                ? current.filter((id) => id !== option.id)
                                : [...current, option.id],
                            );
                          } else {
                            next.set(question.id, selected ? [] : [option.id]);
                          }
                          return next;
                        });
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="ib-permission-actions">
          <button
            type="button"
            className="ib-permission-button"
            onClick={() => {
              const answers = request.questions.map((question) => ({
                questionId: question.id,
                selectedOptionIds: selectedByQuestionId.get(question.id) ?? [],
              }));
              onSubmit(answers);
            }}
          >
            Submit
          </button>
          <button
            type="button"
            className="ib-permission-button ib-permission-button--secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
