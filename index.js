module.exports.handler = async (event, context) => {
  console.info("index called");
  console.info(JSON.stringify(event));
  console.info(JSON.stringify(context));
  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        message: "Go Serverless v3.0! Your function executed successfully!",
        input: event,
      },
      null,
      2
    ),
  };
};
