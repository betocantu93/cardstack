import Component from '@glimmer/component';
import { action, set } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import { dasherize } from '@ember/string';
import { task } from "ember-concurrency";
import ENV from '@cardstack/cardhost/config/environment'

const { environment } = ENV;

const fieldTypeMappings = {
  string: '@cardstack/core-types::string',
  'case-insensitive string': '@cardstack/core-types::case-insensitive',
  boolean: '@cardstack/core-types::boolean',
  date: '@cardstack/core-types::date',
  integer: '@cardstack/core-types::integer',
  'related card': '@cardstack/core-types::belongs-to',
  'related cards': '@cardstack/core-types::has-many',

  // Probably want to omit these types as they could probably be better
  // handled as related cards:
  // '@cardstack/core-types::string-array',
  // '@cardstack/core-types::object',
};

export default class CardManipulator extends Component {
  fieldTypeMappings = fieldTypeMappings;

  @service data;
  @service router;
  @service cardstackSession;

  @tracked statusMsg;
  @tracked card;

  constructor(...args) {
    super(...args);

    this.card = this.args.card;
  }

  get cardJson() {
    if (!this.card) { return null; }
    return JSON.stringify(this.card.json, null, 2);
  }

  get isDirtyStr() {
    return this.card.isDirty.toString();
  }

  @(task(function * () {
    this.statusMsg = null;
    try {
      yield this.card.save();
    } catch (e) {
      console.error(e); // eslint-disable-line no-console
      this.statusMsg = `card ${this.card.id} was NOT successfully created: ${e.message}`;
      return;
    }
    this.router.transitionTo('cards.view', this.card.id);
  })) saveCard;

  @(task(function * () {
    this.statusMsg = null;
    try {
      yield this.card.delete();
    } catch (e) {
      console.error(e); // eslint-disable-line no-console
      this.statusMsg = `card ${this.card.id} was NOT successfully deleted: ${e.message}`;
      return;
    }
    this.router.transitionTo('index');
  })) deleteCard;

  @action
  removeField(field) {
    if (!field || !this.card) { return; }

    this.card.getField(field).remove();
  }

  @action
  addField(displayType, name, isEmbedded, value, position) {
    let type = displayType ? fieldTypeMappings[displayType] : null;
    if (!this.card || !type || !name) { return; }

    let field = this.card.addField({
      type,
      position,
      name: dasherize(name).toLowerCase(),
      neededWhenEmbedded: isEmbedded
    });

    if (value != null) {
      field.setValue(value);
    }

    set(this, 'isEditingSchema', null);
  }

  @action
  setPosition(fieldName, position) {
    if (!fieldName || !this.card || position == null) { return; }

    let card = this.card;
    card.moveField(card.getField(fieldName), position);
  }

  @action
  setNeededWhenEmbedded(fieldName, evt) {
    // this prevents 2-way data binding from trying to alter the Field
    // instance's neededWhenEmbedded value, which is bound to the input
    // that fired this action. Our data service API is very unforgiving when
    // you try to change the Field's state outside of the official API
    // (which is what ember is trying to do). Ember gets mad when it sees
    // that it can't alter the Field's state via the 2-way binding and
    // makes lots of noise. interestingly, this issue only seems to happen
    // when running tests. This work around has yucky visual side effects,
    // so only performing in the test env. A better solution would be to use/make
    // a one-way input control for setting the field.neededWhenEmbedded value.
    // The <Input> component is unfortunately, is not a one-way input helper
    if (environment === 'test') {
      evt.preventDefault();
    }

    let { target: { checked: neededWhenEmbedded } } = evt;
    this.card.getField(fieldName).setNeededWhenEmbedded(neededWhenEmbedded);
  }

  @action
  setFieldValue(fieldName, value) {
    if (!fieldName || !this.card) { return; }
    this.card.getField(fieldName).setValue(value);
  }

  @action
  save() {
    this.saveCard.perform();
  }

  @action
  cancel() {
    this.router.transitionTo('cards.view', this.card.id);
  }

  @action
  delete() {
    this.deleteCard.perform();
  }
}