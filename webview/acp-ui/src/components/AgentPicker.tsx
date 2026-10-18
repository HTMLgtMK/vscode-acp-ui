import type { ReactElement } from "react";

export type AgentPickerProps = {
  availableNames: string[];
  currentName: string;
  disabled: boolean;
  onPick: (name: string) => void;
};

export function AgentPicker({
  availableNames,
  currentName,
  disabled,
  onPick,
}: AgentPickerProps): ReactElement {
  return (
    <div className="composer-config-field">
      <label className="composer-config-label" htmlFor="acp-ui-agent-select">
        Agent
      </label>
      <select
        id="acp-ui-agent-select"
        className="composer-config-select composer-config-select--model"
        aria-label="Agent"
        value={currentName}
        disabled={disabled}
        onChange={(e) => {
          onPick(e.target.value);
        }}
      >
        {availableNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}
