import { TestEnv, createTestEnv } from '../helpers';
import IndexingService from '../../indexing';
import { cardDocument, CardDocument } from '@cardstack/core/card-document';
import { myOrigin } from '@cardstack/core/origin';
import CardsService, { ScopedCardService } from '../../cards-service';
import { Session } from '@cardstack/core/session';
// import { wireItUp } from '../../main';
import { dir as mkTmpDir, DirectoryResult } from 'tmp-promise';
import { CARDSTACK_PUBLIC_REALM } from '@cardstack/core/realm';
import Change from '../../../../cards/git-realm/lib/change';
import { commitOpts, makeRepo } from './support';

function idToCanonicalUrl(id: string) {
  return `${myOrigin}/api/realms/test-git-repo/cards/${id}`;
}

describe('hub/git/indexing', function() {
  let env: TestEnv, indexing: IndexingService, cards: CardsService, service: ScopedCardService;
  let repoRealm = `${myOrigin}/api/realms/test-git-repo`;
  let tmpDir: DirectoryResult;
  let root: string;
  let repoDoc: CardDocument;

  beforeEach(async function() {
    env = await createTestEnv();
    indexing = await env.container.lookup('indexing');
    cards = await env.container.lookup('cards');
    tmpDir = await mkTmpDir({ unsafeCleanup: true });
    root = tmpDir.path;
    service = cards.as(Session.EVERYONE);

    repoDoc = cardDocument()
      .adoptingFrom({ csRealm: CARDSTACK_PUBLIC_REALM, csId: 'git-realm' })
      .withAttributes({ repo: root, csId: repoRealm });

    await service.create(`${myOrigin}/api/realms/meta`, repoDoc.jsonapi);
  });

  afterEach(async function() {
    await env.destroy();
  });

  it('processes first empty branch', async function() {
    let { head } = await makeRepo(root);

    await indexing.update();

    let indexerState = await indexing.loadMeta(repoRealm);
    expect(indexerState!.commit).to.equal(head);
  });

  it('indexes newly added document', async function() {
    let { repo, head } = await makeRepo(root);

    await indexing.update();

    let change = await Change.create(repo, head, 'master');
    let file = await change.get('cards/hello-world.json', { allowCreate: true });
    file.setContent(
      JSON.stringify(
        cardDocument()
          .withField('title', 'string-field')
          .withAttributes({ title: 'hello world' }).jsonapi
      )
    );
    head = await change.finalize(commitOpts());

    await indexing.update();

    let indexerState = await indexing.loadMeta(repoRealm);

    expect(indexerState!.commit).to.equal(head);

    let foundCard = await service.get(idToCanonicalUrl('hello-world'));

    expect(await foundCard.value('title')).to.equal('hello world');
  });

  it('indexes a url-encoded id card', async function() {
    let { repo, head } = await makeRepo(root);

    await indexing.update();

    let change = await Change.create(repo, head, 'master');
    let file = await change.get('cards/foo%2Fbar%2Fbaz.json', { allowCreate: true });
    file.setContent(
      JSON.stringify(
        cardDocument()
          .withField('title', 'string-field')
          .withAttributes({ title: 'hello world' }).jsonapi
      )
    );
    head = await change.finalize(commitOpts());

    await indexing.update();

    let indexerState = await indexing.loadMeta(repoRealm);

    expect(indexerState!.commit).to.equal(head);

    let foundCard = await service.get(idToCanonicalUrl('foo%2Fbar%2Fbaz'));

    expect(await foundCard.value('title')).to.equal('hello world');
  });

  // it('it can index a realm', async function() {
  //   let csRealm = `${myOrigin}/api/realms/first-ephemeral-realm`;
  //   let card = cardDocument().withAutoAttributes({ csRealm, csId: '1', foo: 'bar' });
  //   storage.store(card.upstreamDoc, card.csId, card.csRealm);

  //   await indexing.update();

  //   let indexedCard = await cards.as(Session.INTERNAL_PRIVILEGED).get(card);
  //   expect(indexedCard).to.be.ok;
  // });

  // it('it can remove a document from the index if the document was removed from the data source', async function() {
  //   let csRealm = `${myOrigin}/api/realms/first-ephemeral-realm`;
  //   let card = await cards
  //     .as(Session.INTERNAL_PRIVILEGED)
  //     .create(csRealm, cardDocument().withAutoAttributes({ csRealm, csId: '1', foo: 'bar' }).jsonapi);
  //   storage.store(null, card.csId, card.csRealm, storage.getEntry(card, csRealm)?.generation);
  //   await indexing.update();

  //   let { cards: results } = await cards.as(Session.INTERNAL_PRIVILEGED).search({
  //     filter: { eq: { csId: '1' } },
  //   });
  //   expect(results.length).to.equal(0);
  // });

  // it('it can index multiple realms', async function() {
  //   let realm1 = `${myOrigin}/api/realms/first-ephemeral-realm`;
  //   let realm2 = `http://example.com/api/realms/second-ephemeral-realm`;
  //   let card = cardDocument().withAutoAttributes({ csRealm: realm1, csId: '1', foo: 'bar' });
  //   storage.store(card.upstreamDoc, card.csId, card.csRealm);
  //   card = cardDocument().withAutoAttributes({ csRealm: realm2, csId: '1', foo: 'bar' });
  //   storage.store(card.upstreamDoc, card.csId, card.csRealm);

  //   await indexing.update();

  //   let { cards: results } = await cards.as(Session.INTERNAL_PRIVILEGED).search({
  //     filter: { eq: { csId: '1' } },
  //   });
  //   expect(results.length).to.equal(2);
  // });

  // it('ephemeral cards do not persist in the index between container teardowns', async function() {
  //   let realm = `${myOrigin}/api/realms/first-ephemeral-realm`;

  //   // card is indexed in torn down ephemeral storage
  //   // This card will _not_ live through the container teardown
  //   let card = cardDocument().withAutoAttributes({ csRealm: realm, csId: '1', foo: 'bar' });
  //   storage.store(card.upstreamDoc, card.csId, card.csRealm);
  //   await indexing.update();

  //   // card is not yet indexed in torn down ephemeral storage
  //   // This card will _not_ live through the container teardown
  //   card = cardDocument().withAutoAttributes({ csRealm: realm, csId: '2', foo: 'bar' });
  //   storage.store(await card.upstreamDoc, card.csId, card.csRealm);
  //   await env.container.teardown();
  //   env.container = await wireItUp();

  //   cards = await env.container.lookup('cards');
  //   indexing = await env.container.lookup('indexing');
  //   storage = await env.container.lookup('ephemeralStorage');
  //   (await env.container.lookup('queue')).launchJobRunner();

  //   // card is not yet indexed in new ephemeral storage
  //   // This card _will_ live through the container teardown
  //   card = cardDocument().withAutoAttributes({ csRealm: realm, csId: '3', foo: 'bar' });
  //   storage.store(await card.upstreamDoc, card.csId, card.csRealm);
  //   await indexing.update();

  //   let { cards: results } = await cards.as(Session.INTERNAL_PRIVILEGED).search({
  //     filter: { eq: { csId: '1' } },
  //   });
  //   expect(results.length).to.equal(0);

  //   ({ cards: results } = await cards.as(Session.INTERNAL_PRIVILEGED).search({
  //     filter: { eq: { csId: '2' } },
  //   }));
  //   expect(results.length).to.equal(0);

  //   ({ cards: results } = await cards.as(Session.INTERNAL_PRIVILEGED).search({
  //     filter: { eq: { csId: '3' } },
  //   }));
  //   expect(results.length).to.equal(1);
  // });

  // it('it does not index unchanged cards since the last time the ephemeral realm was indexed', async function() {
  //   let realm = `${myOrigin}/api/realms/first-ephemeral-realm`;

  //   let steps = await cards.as(Session.INTERNAL_PRIVILEGED).create(
  //     realm,
  //     cardDocument()
  //       .withField('foo', 'string-field')
  //       .withField('step', 'integer-field').jsonapi
  //   );

  //   async function cardsWithStep(n: number): Promise<number> {
  //     let found = await cards.as(Session.INTERNAL_PRIVILEGED).search({
  //       filter: {
  //         type: steps,
  //         eq: {
  //           step: n,
  //         },
  //       },
  //     });
  //     return found.cards.length;
  //   }

  //   // Add a new card
  //   let card = cardDocument()
  //     .withAttributes({ csRealm: realm, csId: '1', foo: 'bar', step: 1 })
  //     .adoptingFrom(steps);
  //   storage.store(card.upstreamDoc, card.csId, card.csRealm);
  //   await indexing.update();
  //   expect(await cardsWithStep(1)).to.equal(1);

  //   // Add another new card
  //   card = cardDocument()
  //     .withAttributes({ csRealm: realm, csId: '2', foo: 'bar', step: 2 })
  //     .adoptingFrom(steps);
  //   storage.store(card.upstreamDoc, card.csId, card.csRealm);

  //   // Maniuplate existing card so we would notice if it gets indexed when it shouldn't.
  //   await storage.inThePast(async () => {
  //     card = cardDocument()
  //       .withAttributes({ csRealm: realm, csId: '1', foo: 'bar', step: 2 })
  //       .adoptingFrom(steps);
  //     storage.store(card.upstreamDoc, card.csId, card.csRealm, storage.getEntry('1', realm)?.generation);
  //   });

  //   await indexing.update();
  //   let n = await cardsWithStep(2);
  //   expect(n).to.equal(1);

  //   // Update first card
  //   card = cardDocument()
  //     .withAttributes({ csRealm: realm, csId: '1', foo: 'bar', step: 3 })
  //     .adoptingFrom(steps);
  //   storage.store(card.upstreamDoc, card.csId, card.csRealm, storage.getEntry('1', realm)?.generation);

  //   // Maniuplate other existing card so we would notice if it gets indexed when it shouldn't.
  //   await storage.inThePast(async () => {
  //     card = cardDocument()
  //       .withAttributes({ csRealm: realm, csId: '2', foo: 'bar', step: 3 })
  //       .adoptingFrom(steps);
  //     storage.store(card.upstreamDoc, card.csId, card.csRealm, storage.getEntry('2', realm)?.generation);
  //   });

  //   await indexing.update();
  //   expect(await cardsWithStep(3)).to.equal(1);

  //   // Delete card 2
  //   storage.store(null, card.csId, card.csRealm, storage.getEntry('2', realm)?.generation);

  //   // Maniuplate other existing card so we would notice if it gets indexed when it shouldn't.
  //   await storage.inThePast(async () => {
  //     card = cardDocument()
  //       .withAttributes({ csRealm: realm, csId: '1', foo: 'bar', step: 4 })
  //       .adoptingFrom(steps);
  //     storage.store(card.upstreamDoc, card.csId, card.csRealm, storage.getEntry('1', realm)?.generation);
  //   });

  //   await indexing.update();
  //   expect(await cardsWithStep(4)).to.equal(0);

  //   // stable case
  //   await indexing.update();
  //   expect(await cardsWithStep(4)).to.equal(0);
  // });
});