import type { Skill } from "../App"
import { API } from "../App"
import "./SkillPicker.css"

interface Props {
  skills: Skill[]
  onPick: (skillName: string) => void
  onClose: () => void
}

function SkillPicker({ skills, onPick, onClose }: Props) {
  return (
    <div className="skill-picker-overlay" onClick={onClose}>
      <div className="skill-picker" onClick={(e) => e.stopPropagation()}>
        <h3>选择角色</h3>
        <div className="skill-list">
          {skills.map((s) => (
            <button
              key={s.id}
              className="skill-card"
              onClick={() => onPick(s.id)}
            >
              <div className="skill-card-top">
                {s.avatar ? (
                  <img
                    className="skill-avatar"
                    src={`${API}${s.avatar}`}
                    alt={s.name}
                  />
                ) : (
                  <span className="skill-avatar-default">
                    {s.name.charAt(0)}
                  </span>
                )}
                <div className="skill-card-info">
                  <span className="skill-name">{s.name}</span>
                  <span className="skill-rel">{s.relationship}</span>
                </div>
              </div>
              <span className="skill-desc">{s.description}</span>
            </button>
          ))}
        </div>
        <button className="skill-close" onClick={onClose}>
          取消
        </button>
      </div>
    </div>
  )
}

export default SkillPicker
