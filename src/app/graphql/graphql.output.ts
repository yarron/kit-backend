import { Field, Int, ObjectType } from "@nestjs/graphql";

/**
 * Pagination envelope returned by every list query.
 *
 * `total` is the count BEFORE pagination — the frontend needs it to draw the
 * pager. It costs a second query; on a large collection with a selective filter
 * that second query is the expensive one, which is why `count` deserves the
 * same index as `find`.
 */
@ObjectType()
export class MetaOutput {
	@Field(() => Int)
	skip: number;

	@Field(() => Int)
	take: number;

	@Field(() => Int)
	total: number;
}
