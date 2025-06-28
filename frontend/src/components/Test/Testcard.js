import React from "react";
import "./tedst.css"; // Import the CSS file for styling

const Card = ({ image, title, description, buttonText, onButtonClick }) => {
  return (
    <div className="w-full h-screen flex flex-col justify-center items-center bg-gray-100">
      <div className="w-full h-[90%] flex justify-center items-center flex-wrap bg-green-500 gap-4 p-4 overflow-y-auto">
        {mapfunc.map((item, index) => (
          <div
            key={index}
            className="bg-white flex flex-col items-center p-4 rounded-lg shadow-lg transition-all duration-300
        w-full sm:w-[80%] md:w-[45%] lg:w-[30%] xl:w-[22%]
        min-w-[250px] h-auto"
          >
            <img
              src={item.image}
              alt={item.title}
              className="rounded-t-lg w-full h-[200px] object-cover"
            />
            <div className="p-4">
              <h2 className="text-lg font-semibold mb-2">{item.title}</h2>
              <p className="text-gray-600 mb-4">{item.description}</p>
              <button
                onClick={item.onButtonClick}
                className="bg-blue-500 text-white px-4 py-2 rounded-md"
              >
                {item.buttonText}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Card;
