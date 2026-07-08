import { STAGE_LABELS } from '../../lib/hiring/formatINR.js';

export default function StageStepper({ currentStage }) {
  const stages = Object.entries(STAGE_LABELS).map(([n, label]) => ({ n: Number(n), label }));
  return (
    <div className="hr-stepper">
      {stages.filter((s) => s.n <= 7 || s.n === currentStage).map((s) => {
        let cls = 'hr-step';
        if (s.n === currentStage) cls += ' active';
        else if (s.n < currentStage && currentStage <= 7) cls += ' done';
        return (
          <span key={s.n} className={cls}>
            {s.label}
          </span>
        );
      })}
      {currentStage >= 8 && (
        <span className="hr-step active">{STAGE_LABELS[currentStage]}</span>
      )}
    </div>
  );
}
