module.exports = {
  valid(value) {
    return typeof value==='number' && (value%1)===0;
  },
  defaultMapping() {
    return {
      type: "long"
    };
  },
  buildQueryExpression(sourceExpression, name){
    return ['(', ...sourceExpression, '->>', { param: name }, ')::bigint'];
  }
};
