def validate_proposal_references(proposal, metadata):
    entities = {entity.id: entity for entity in metadata.entities}
    relationships = {relationship.id: relationship for relationship in metadata.relationships}
    root_id = proposal["rootEntityId"]

    if root_id not in entities:
        raise ValueError("The proposed root entity is not available in the supplied metadata.")

    def validate_field(reference):
        entity_id = root_id
        for relationship_id in reference.get("relationshipPath") or []:
            relationship = relationships.get(relationship_id)
            if relationship is None or relationship.fromEntity != entity_id:
                raise ValueError("A proposed relationship is not available from this entity.")
            entity_id = relationship.toEntity

        entity = entities.get(entity_id)
        if entity is None or not any(field.id == reference["fieldId"] for field in entity.fields):
            raise ValueError("A proposed field is not available in the supplied metadata.")

    def validate_condition(condition):
        if condition["kind"] == "group":
            for child in condition["children"]:
                validate_condition(child)
        else:
            validate_field(condition["left"])
            right = condition.get("right")
            if right is not None and right["kind"] == "field":
                validate_field(right["field"])

    validate_condition(proposal["condition"])
