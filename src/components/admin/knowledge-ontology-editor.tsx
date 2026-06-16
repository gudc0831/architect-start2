import type {
  KnowledgeOntologyNode,
  KnowledgeOntologyRelationKind,
} from "@/domains/knowledge/structured-knowledge";
import styles from "@/components/admin/knowledge-admin-shell.module.css";

const ontologyCategoryOptions: Array<{ value: KnowledgeOntologyNode["category"]; label: string }> = [
  { value: "legal_rule", label: "legal_rule / 법규" },
  { value: "workflow", label: "workflow / 절차" },
  { value: "project_condition", label: "project_condition / 프로젝트 조건" },
  { value: "design_decision", label: "design_decision / 설계 결정" },
  { value: "reference", label: "reference / 참조" },
];

const ontologyScopeOptions: Array<{ value: KnowledgeOntologyNode["scope"]; label: string }> = [
  { value: "organization", label: "organization / 조직" },
  { value: "project", label: "project / 프로젝트" },
  { value: "project_members", label: "project_members / 프로젝트 멤버" },
  { value: "admin_only", label: "admin_only / 관리자" },
];

const relationKindOptions: KnowledgeOntologyRelationKind[] = [
  "parent",
  "child",
  "related",
  "depends_on",
  "conflicts_with",
  "supersedes",
  "supplements",
];

type KnowledgeOntologyEditorProps = {
  ontology: KnowledgeOntologyNode | null;
  onChange?: (ontology: KnowledgeOntologyNode) => void;
};

export function KnowledgeOntologyEditor({ ontology, onChange }: KnowledgeOntologyEditorProps) {
  if (!ontology) {
    return (
      <section className={styles.structuredPanel} aria-label="ontology editor">
        <div className={styles.structuredPanelHeader}>
          <div>
            <p>Ontology</p>
            <h4>온톨로지</h4>
          </div>
          <span>blocking / 차단</span>
        </div>
        <p className={styles.empty}>온톨로지 노드가 없어 concept label, category, scope, relations, relation reason 검토가 차단됩니다.</p>
      </section>
    );
  }

  const editable = Boolean(onChange);

  return (
    <section className={styles.structuredPanel} aria-label="ontology editor">
      <div className={styles.structuredPanelHeader}>
        <div>
          <p>Ontology</p>
          <h4>온톨로지</h4>
        </div>
        <span>{ontology.relations.length} relations</span>
      </div>
      <div className={styles.structuredFieldGrid}>
        <label>
          Concept label
          <input
            aria-label="concept label"
            disabled={!editable}
            value={ontology.label}
            onChange={(event) => updateOntology(ontology, onChange, { label: event.target.value })}
          />
        </label>
        <label>
          Category
          <select
            aria-label="category"
            disabled={!editable}
            value={ontology.category}
            onChange={(event) =>
              updateOntology(ontology, onChange, { category: event.target.value as KnowledgeOntologyNode["category"] })
            }
          >
            {ontologyCategoryOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          Scope
          <select
            aria-label="scope"
            disabled={!editable}
            value={ontology.scope}
            onChange={(event) =>
              updateOntology(ontology, onChange, { scope: event.target.value as KnowledgeOntologyNode["scope"] })
            }
          >
            {ontologyScopeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      <section className={styles.ontologyRelations} aria-label="relations">
        <div className={styles.structuredPanelHeader}>
          <div>
            <p>Relations</p>
            <h4>관계</h4>
          </div>
          <button disabled={!editable} onClick={() => addRelation(ontology, onChange)} type="button">
            관계 추가
          </button>
        </div>
        {ontology.relations.length ? ontology.relations.map((relation, index) => (
          <article className={styles.ontologyRelationRow} key={`${relation.kind}-${relation.targetId}-${index}`}>
            <label>
              Relation
              <select
                aria-label="relations"
                disabled={!editable}
                value={relation.kind}
                onChange={(event) => updateRelation(ontology, onChange, index, { kind: event.target.value as KnowledgeOntologyRelationKind })}
              >
                {relationKindOptions.map((kind) => (
                  <option key={kind} value={kind}>{kind}</option>
                ))}
              </select>
            </label>
            <label>
              Target
              <input
                disabled={!editable}
                value={relation.targetId}
                onChange={(event) => updateRelation(ontology, onChange, index, { targetId: event.target.value })}
              />
            </label>
            <label>
              Relation reason
              <textarea
                aria-label="relation reason"
                disabled={!editable}
                rows={2}
                value={relation.reason}
                onChange={(event) => updateRelation(ontology, onChange, index, { reason: event.target.value })}
              />
            </label>
            <button disabled={!editable} onClick={() => removeRelation(ontology, onChange, index)} type="button">
              제거
            </button>
          </article>
        )) : <p className={styles.empty}>relations가 없습니다. 연결된 WIKI나 상충 관계가 있으면 relation reason과 함께 추가하세요.</p>}
      </section>
    </section>
  );
}

function updateOntology(
  ontology: KnowledgeOntologyNode,
  onChange: KnowledgeOntologyEditorProps["onChange"],
  patch: Partial<KnowledgeOntologyNode>,
) {
  onChange?.({ ...ontology, ...patch });
}

function updateRelation(
  ontology: KnowledgeOntologyNode,
  onChange: KnowledgeOntologyEditorProps["onChange"],
  index: number,
  patch: Partial<KnowledgeOntologyNode["relations"][number]>,
) {
  onChange?.({
    ...ontology,
    relations: ontology.relations.map((relation, relationIndex) =>
      relationIndex === index ? { ...relation, ...patch } : relation,
    ),
  });
}

function addRelation(ontology: KnowledgeOntologyNode, onChange: KnowledgeOntologyEditorProps["onChange"]) {
  onChange?.({
    ...ontology,
    relations: [...ontology.relations, { kind: "related", targetId: "", reason: "" }],
  });
}

function removeRelation(
  ontology: KnowledgeOntologyNode,
  onChange: KnowledgeOntologyEditorProps["onChange"],
  index: number,
) {
  onChange?.({
    ...ontology,
    relations: ontology.relations.filter((_, relationIndex) => relationIndex !== index),
  });
}
